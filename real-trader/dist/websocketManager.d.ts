import { EventEmitter } from 'events';
import type { WebSocketStreamConfig, WebSocketManager, MarketStreamData, UserDataStreamData, BinanceConfig } from './types.js';
export declare class BinanceWebSocketManager extends EventEmitter implements WebSocketManager {
    private ws;
    private config;
    private isConnected;
    private reconnectAttempts;
    private reconnectTimer;
    private pingTimer;
    private subscribedStreams;
    private messageQueue;
    private lastPongTime;
    private binanceConfig;
    constructor(binanceConfig: BinanceConfig, config?: Partial<WebSocketStreamConfig>);
    connect(): Promise<void>;
    disconnect(): void;
    subscribe(streams: string[]): void;
    unsubscribe(streams: string[]): void;
    onMessage(callback: (data: MarketStreamData | UserDataStreamData) => void): void;
    onError(callback: (error: Error) => void): void;
    onClose(callback: () => void): void;
    getConnectionStatus(): {
        connected: boolean;
        reconnectAttempts: number;
        subscribedStreams: string[];
        lastPongTime: number;
    };
    private handleMessage;
    private handleDisconnection;
    private sendMessage;
    private processMessageQueue;
    private startPingMonitoring;
}
export declare function createMarketStreamManager(binanceConfig: BinanceConfig, symbols: string[], streamTypes?: string[]): BinanceWebSocketManager;
export declare function createUserDataStreamManager(binanceConfig: BinanceConfig, listenKey: string): BinanceWebSocketManager;
