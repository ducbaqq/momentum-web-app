import WebSocket from 'ws';
import { EventEmitter } from 'events';
export class BinanceWebSocketManager extends EventEmitter {
    ws = null;
    config;
    isConnected = false;
    reconnectAttempts = 0;
    reconnectTimer = null;
    pingTimer = null;
    subscribedStreams = new Set();
    messageQueue = [];
    lastPongTime = 0;
    binanceConfig;
    constructor(binanceConfig, config) {
        super();
        this.binanceConfig = binanceConfig;
        // Default WebSocket configuration
        this.config = {
            baseUrl: binanceConfig.testnet
                ? 'wss://stream.testnet.binance.vision/ws'
                : 'wss://stream.binance.com:9443/ws',
            streams: [],
            reconnect: config?.reconnect ?? true,
            reconnectInterval: config?.reconnectInterval ?? 5000,
            maxReconnects: config?.maxReconnects ?? -1, // -1 means infinite
            ...config
        };
    }
    async connect() {
        if (this.isConnected || this.ws) {
            return;
        }
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = this.config.streams.length > 0
                    ? `${this.config.baseUrl.replace('/ws', '')}/stream?streams=${this.config.streams.join('/')}`
                    : this.config.baseUrl;
                console.log(`🔌 Connecting to Binance WebSocket: ${wsUrl.replace(/\/[^/]*$/, '/***')}`);
                this.ws = new WebSocket(wsUrl);
                this.ws.on('open', () => {
                    console.log('✅ WebSocket connected successfully');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.lastPongTime = Date.now();
                    // Start ping/pong monitoring
                    this.startPingMonitoring();
                    // Process any queued messages
                    this.processMessageQueue();
                    this.emit('connected');
                    resolve();
                });
                this.ws.on('message', (data) => {
                    this.handleMessage(data);
                });
                this.ws.on('close', (code, reason) => {
                    console.log(`🔌 WebSocket disconnected: ${code} - ${reason.toString()}`);
                    this.handleDisconnection();
                });
                this.ws.on('error', (error) => {
                    console.error('❌ WebSocket error:', error.message);
                    this.emit('error', error);
                    reject(error);
                });
                this.ws.on('ping', (data) => {
                    // Respond to server ping
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.pong(data);
                    }
                });
                this.ws.on('pong', () => {
                    this.lastPongTime = Date.now();
                });
                // Timeout for connection
                setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 10000);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    disconnect() {
        this.config.reconnect = false; // Prevent reconnection
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, 'Normal closure');
            }
            this.ws = null;
        }
        this.isConnected = false;
        this.subscribedStreams.clear();
        this.emit('disconnected');
        console.log('🔌 WebSocket disconnected manually');
    }
    subscribe(streams) {
        const newStreams = streams.filter(stream => !this.subscribedStreams.has(stream));
        if (newStreams.length === 0) {
            return;
        }
        newStreams.forEach(stream => this.subscribedStreams.add(stream));
        if (this.isConnected && this.ws) {
            const message = JSON.stringify({
                method: 'SUBSCRIBE',
                params: newStreams,
                id: Date.now()
            });
            this.sendMessage(message);
            console.log(`📡 Subscribed to streams: ${newStreams.join(', ')}`);
        }
        else {
            // Queue for later when connected
            this.config.streams = Array.from(this.subscribedStreams);
        }
    }
    unsubscribe(streams) {
        const existingStreams = streams.filter(stream => this.subscribedStreams.has(stream));
        if (existingStreams.length === 0) {
            return;
        }
        existingStreams.forEach(stream => this.subscribedStreams.delete(stream));
        if (this.isConnected && this.ws) {
            const message = JSON.stringify({
                method: 'UNSUBSCRIBE',
                params: existingStreams,
                id: Date.now()
            });
            this.sendMessage(message);
            console.log(`📡 Unsubscribed from streams: ${existingStreams.join(', ')}`);
        }
        this.config.streams = Array.from(this.subscribedStreams);
    }
    onMessage(callback) {
        this.on('message', callback);
    }
    onError(callback) {
        this.on('error', callback);
    }
    onClose(callback) {
        this.on('close', callback);
    }
    // Additional utility methods
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            subscribedStreams: Array.from(this.subscribedStreams),
            lastPongTime: this.lastPongTime
        };
    }
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            // Handle subscription responses
            if (message.id && message.result === null) {
                console.log(`✅ WebSocket subscription confirmed (ID: ${message.id})`);
                return;
            }
            // Handle subscription errors
            if (message.id && message.error) {
                console.error(`❌ WebSocket subscription error (ID: ${message.id}):`, message.error);
                this.emit('error', new Error(`Subscription error: ${message.error.msg}`));
                return;
            }
            // Handle stream data
            if (message.stream && message.data) {
                const streamData = {
                    stream: message.stream,
                    data: message.data
                };
                this.emit('message', streamData);
                this.emit(`stream:${message.stream}`, message.data);
            }
            else if (message.e) {
                // Direct user data stream event
                const userData = message;
                this.emit('message', userData);
                this.emit(`event:${message.e}`, message);
            }
            else {
                // Direct market data (single stream connection)
                this.emit('message', message);
            }
        }
        catch (error) {
            console.error('❌ Failed to parse WebSocket message:', error);
            this.emit('error', new Error('Failed to parse WebSocket message'));
        }
    }
    handleDisconnection() {
        this.isConnected = false;
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        this.emit('close');
        // Attempt reconnection if enabled
        if (this.config.reconnect &&
            (this.config.maxReconnects === -1 || this.reconnectAttempts < this.config.maxReconnects)) {
            this.reconnectAttempts++;
            const delay = Math.min(30000, this.config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1));
            console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
            this.reconnectTimer = setTimeout(() => {
                this.connect().catch(error => {
                    console.error('❌ Reconnection failed:', error.message);
                });
            }, delay);
        }
        else {
            console.log('❌ Max reconnection attempts reached or reconnection disabled');
        }
    }
    sendMessage(message) {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        }
        else {
            this.messageQueue.push(message);
        }
    }
    processMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected && this.ws) {
            const message = this.messageQueue.shift();
            if (message) {
                this.ws.send(message);
            }
        }
    }
    startPingMonitoring() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
        }
        // Send ping every 20 seconds and check for pong responses
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const now = Date.now();
                // Check if we've received a pong recently
                if (now - this.lastPongTime > 60000) { // 1 minute timeout
                    console.warn('⚠️ No pong response received, connection may be stale');
                    this.ws.terminate();
                    return;
                }
                // Send ping
                this.ws.ping();
            }
        }, 20000); // 20 seconds
    }
}
// Factory function to create market data stream manager
export function createMarketStreamManager(binanceConfig, symbols, streamTypes = ['ticker', 'kline_1m', 'depth5']) {
    const streams = symbols.flatMap(symbol => streamTypes.map(type => `${symbol.toLowerCase()}@${type}`));
    return new BinanceWebSocketManager(binanceConfig, {
        streams,
        reconnect: true,
        reconnectInterval: 5000
    });
}
// Factory function to create user data stream manager
export function createUserDataStreamManager(binanceConfig, listenKey) {
    const baseUrl = binanceConfig.testnet
        ? `wss://stream.testnet.binance.vision/ws/${listenKey}`
        : `wss://stream.binance.com:9443/ws/${listenKey}`;
    return new BinanceWebSocketManager(binanceConfig, {
        baseUrl,
        streams: [],
        reconnect: true,
        reconnectInterval: 5000
    });
}
