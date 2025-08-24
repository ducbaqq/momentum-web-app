import type { BinanceConfig, BinanceOrderResponse, BinancePosition, BinanceAccountInfo } from './types.js';
export declare class BinanceClient {
    private client;
    private config;
    constructor(config: BinanceConfig);
    testConnection(): Promise<boolean>;
    getAccountInfo(): Promise<BinanceAccountInfo>;
    getPositions(): Promise<BinancePosition[]>;
    getPosition(symbol: string): Promise<BinancePosition | null>;
    getCurrentPrice(symbol: string): Promise<number>;
    getCurrentPrices(symbols: string[]): Promise<Record<string, number>>;
    placeFuturesMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, options?: {
        leverage?: number;
        marginType?: 'isolated' | 'cross';
        positionSide?: 'LONG' | 'SHORT';
    }): Promise<BinanceOrderResponse>;
    placeFuturesLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number, options?: {
        leverage?: number;
        marginType?: 'isolated' | 'cross';
        positionSide?: 'LONG' | 'SHORT';
        timeInForce?: 'GTC' | 'IOC' | 'FOK';
    }): Promise<BinanceOrderResponse>;
    placeStopLossOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopPrice: number, options?: {
        positionSide?: 'LONG' | 'SHORT';
    }): Promise<BinanceOrderResponse>;
    placeTakeProfitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopPrice: number, options?: {
        positionSide?: 'LONG' | 'SHORT';
    }): Promise<BinanceOrderResponse>;
    cancelOrder(symbol: string, orderId: number): Promise<any>;
    getOrderStatus(symbol: string, orderId: number): Promise<any>;
    getSymbolInfo(symbol: string): Promise<any>;
    getMinOrderSize(symbol: string): Promise<{
        minQty: number;
        stepSize: number;
    }>;
    formatQuantity(symbol: string, quantity: number, stepSize: number): number;
    getAvailableBalance(): Promise<number>;
    getTotalWalletBalance(): Promise<number>;
}
