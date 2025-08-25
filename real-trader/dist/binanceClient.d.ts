import type { BinanceConfig, BinanceOrderResponse, BinancePosition, BinanceAccountInfo } from './types.js';
import { OrderSide, TimeInForce, PositionSide } from './types.js';
import { BinanceWebSocketManager } from './websocketManager.js';
export declare class BinanceClient {
    private client;
    private config;
    private errorHandler;
    private symbolInfoCache;
    private symbolInfoCacheExpiry;
    private marketStreamManager;
    private userStreamManager;
    private userStreamListenKey;
    constructor(config: BinanceConfig);
    testConnection(): Promise<boolean>;
    getAccountInfo(): Promise<BinanceAccountInfo>;
    getPositions(): Promise<BinancePosition[]>;
    getPosition(symbol: string): Promise<BinancePosition | null>;
    getCurrentPrice(symbol: string): Promise<number>;
    getCurrentPrices(symbols: string[]): Promise<Record<string, number>>;
    placeFuturesMarketOrder(symbol: string, side: OrderSide, quantity: number, options?: {
        leverage?: number;
        marginType?: 'isolated' | 'cross';
        positionSide?: PositionSide;
        timeInForce?: TimeInForce;
    }): Promise<BinanceOrderResponse>;
    placeFuturesLimitOrder(symbol: string, side: OrderSide, quantity: number, price: number, options?: {
        leverage?: number;
        marginType?: 'isolated' | 'cross';
        positionSide?: PositionSide;
        timeInForce?: TimeInForce;
    }): Promise<BinanceOrderResponse>;
    placeStopLossOrder(symbol: string, side: OrderSide, quantity: number, stopPrice: number, options?: {
        positionSide?: PositionSide;
        timeInForce?: TimeInForce;
    }): Promise<BinanceOrderResponse>;
    placeTakeProfitOrder(symbol: string, side: OrderSide, quantity: number, stopPrice: number, options?: {
        positionSide?: PositionSide;
        timeInForce?: TimeInForce;
    }): Promise<BinanceOrderResponse>;
    cancelOrder(symbol: string, orderId: number): Promise<any>;
    getOrderStatus(symbol: string, orderId: number): Promise<any>;
    getSymbolInfo(symbol: string): Promise<any>;
    getMinOrderSize(symbol: string): Promise<{
        minQty: number;
        stepSize: number;
        minPrice?: number;
        tickSize?: number;
        minNotional?: number;
    }>;
    formatQuantity(symbol: string, quantity: number): string;
    formatPrice(symbol: string, price: number): string;
    getAvailableBalance(): Promise<number>;
    getTotalWalletBalance(): Promise<number>;
    initializeMarketStreams(symbols: string[], streamTypes?: string[]): Promise<void>;
    initializeUserDataStream(): Promise<void>;
    getMarketStreamManager(): BinanceWebSocketManager | null;
    getUserStreamManager(): BinanceWebSocketManager | null;
    private createListenKey;
    private keepAliveListenKey;
    private executeWithRetry;
    private validateOrderParameters;
    private sleep;
    disconnect(): Promise<void>;
}
