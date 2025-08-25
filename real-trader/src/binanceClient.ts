import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BinanceModule = require('binance-api-node');
const Binance = BinanceModule.default || BinanceModule;
import type { 
  BinanceConfig, 
  BinanceOrderResponse, 
  BinancePosition, 
  BinanceAccountInfo,
  BinanceError
} from './types.js';
import { OrderType, OrderSide, TimeInForce, PositionSide } from './types.js';
import { BinanceErrorHandler, parseBinanceError } from './errorHandler.js';
import { BinanceWebSocketManager, createMarketStreamManager, createUserDataStreamManager } from './websocketManager.js';

export class BinanceClient {
  private client: any;
  private config: BinanceConfig;
  private errorHandler: BinanceErrorHandler;
  private symbolInfoCache: Map<string, any> = new Map();
  private symbolInfoCacheExpiry: Map<string, number> = new Map();
  private marketStreamManager: BinanceWebSocketManager | null = null;
  private userStreamManager: BinanceWebSocketManager | null = null;
  private userStreamListenKey: string | null = null;

  constructor(config: BinanceConfig) {
    this.config = config;
    this.errorHandler = new BinanceErrorHandler(config.errorConfig);
    
    // Initialize Binance client
    this.client = Binance({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      httpFutures: config.testnet 
        ? 'https://testnet.binancefuture.com' 
        : 'https://fapi.binance.com',
      wsFutures: config.testnet
        ? 'wss://fstream.binancefuture.com'
        : 'wss://fstream.binance.com',
    });
  }

  async testConnection(): Promise<boolean> {
    return this.executeWithRetry(async () => {
      await this.client.futuresTime();
      console.log(`✓ Binance ${this.config.testnet ? 'Testnet' : 'Mainnet'} connected successfully`);
      return true;
    }, 'testConnection');
  }

  async getAccountInfo(): Promise<BinanceAccountInfo> {
    return this.executeWithRetry(async () => {
      return await this.client.futuresAccountInfo();
    }, 'getAccountInfo');
  }

  async getPositions(): Promise<BinancePosition[]> {
    return this.executeWithRetry(async () => {
      const accountInfo = await this.getAccountInfo();
      return accountInfo.positions.filter(p => parseFloat(p.positionAmt) !== 0);
    }, 'getPositions');
  }

  async getPosition(symbol: string): Promise<BinancePosition | null> {
    return this.executeWithRetry(async () => {
      const positions = await this.getPositions();
      return positions.find(p => p.symbol === symbol) || null;
    }, 'getPosition');
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    return this.executeWithRetry(async () => {
      const ticker = await this.client.futuresPrices({ symbol });
      return parseFloat(ticker[symbol]);
    }, 'getCurrentPrice');
  }

  async getCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
    return this.executeWithRetry(async () => {
      const tickers = await this.client.futuresPrices();
      const result: Record<string, number> = {};
      
      for (const symbol of symbols) {
        if (tickers[symbol]) {
          result[symbol] = parseFloat(tickers[symbol]);
        }
      }
      
      return result;
    }, 'getCurrentPrices');
  }

  async placeFuturesMarketOrder(
    symbol: string,
    side: OrderSide,
    quantity: number,
    options?: {
      leverage?: number;
      marginType?: 'isolated' | 'cross';
      positionSide?: PositionSide;
      timeInForce?: TimeInForce;
    }
  ): Promise<BinanceOrderResponse> {
    // Validate order parameters
    await this.validateOrderParameters(symbol, OrderType.MARKET, side, quantity, undefined, options?.timeInForce);
    
    return this.executeWithRetry(async () => {
      // Set leverage if specified
      if (options?.leverage) {
        await this.client.futuresLeverage({
          symbol,
          leverage: options.leverage,
        });
      }

      // Set margin type if specified
      if (options?.marginType) {
        await this.client.futuresMarginType({
          symbol,
          marginType: options.marginType.toUpperCase(),
        });
      }

      // Place the order
      const order = await this.client.futuresOrder({
        symbol,
        side,
        type: OrderType.MARKET,
        quantity: this.formatQuantity(symbol, quantity),
        positionSide: options?.positionSide || PositionSide.BOTH,
        timeInForce: options?.timeInForce,
      });

      return order;
    }, 'placeFuturesMarketOrder');
  }

  async placeFuturesLimitOrder(
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: number,
    options?: {
      leverage?: number;
      marginType?: 'isolated' | 'cross';
      positionSide?: PositionSide;
      timeInForce?: TimeInForce;
    }
  ): Promise<BinanceOrderResponse> {
    // Validate order parameters
    await this.validateOrderParameters(symbol, OrderType.LIMIT, side, quantity, price, options?.timeInForce);
    
    return this.executeWithRetry(async () => {
      // Set leverage if specified
      if (options?.leverage) {
        await this.client.futuresLeverage({
          symbol,
          leverage: options.leverage,
        });
      }

      // Set margin type if specified
      if (options?.marginType) {
        await this.client.futuresMarginType({
          symbol,
          marginType: options.marginType.toUpperCase(),
        });
      }

      // Place the order
      const order = await this.client.futuresOrder({
        symbol,
        side,
        type: OrderType.LIMIT,
        quantity: this.formatQuantity(symbol, quantity),
        price: this.formatPrice(symbol, price),
        timeInForce: options?.timeInForce || TimeInForce.GTC,
        positionSide: options?.positionSide || PositionSide.BOTH,
      });

      return order;
    }, 'placeFuturesLimitOrder');
  }

  async placeStopLossOrder(
    symbol: string,
    side: OrderSide,
    quantity: number,
    stopPrice: number,
    options?: {
      positionSide?: PositionSide;
      timeInForce?: TimeInForce;
    }
  ): Promise<BinanceOrderResponse> {
    // Validate order parameters
    await this.validateOrderParameters(symbol, OrderType.STOP_LOSS, side, quantity, stopPrice, options?.timeInForce);
    
    return this.executeWithRetry(async () => {
      const order = await this.client.futuresOrder({
        symbol,
        side,
        type: 'STOP_MARKET',
        quantity: this.formatQuantity(symbol, quantity),
        stopPrice: this.formatPrice(symbol, stopPrice),
        positionSide: options?.positionSide || PositionSide.BOTH,
        timeInForce: options?.timeInForce,
      });

      return order;
    }, 'placeStopLossOrder');
  }

  async placeTakeProfitOrder(
    symbol: string,
    side: OrderSide,
    quantity: number,
    stopPrice: number,
    options?: {
      positionSide?: PositionSide;
      timeInForce?: TimeInForce;
    }
  ): Promise<BinanceOrderResponse> {
    // Validate order parameters
    await this.validateOrderParameters(symbol, OrderType.TAKE_PROFIT, side, quantity, stopPrice, options?.timeInForce);
    
    return this.executeWithRetry(async () => {
      const order = await this.client.futuresOrder({
        symbol,
        side,
        type: 'TAKE_PROFIT_MARKET',
        quantity: this.formatQuantity(symbol, quantity),
        stopPrice: this.formatPrice(symbol, stopPrice),
        positionSide: options?.positionSide || PositionSide.BOTH,
        timeInForce: options?.timeInForce,
      });

      return order;
    }, 'placeTakeProfitOrder');
  }

  async cancelOrder(symbol: string, orderId: number): Promise<any> {
    return this.executeWithRetry(async () => {
      return await this.client.futuresCancelOrder({
        symbol,
        orderId,
      });
    }, 'cancelOrder');
  }

  async getOrderStatus(symbol: string, orderId: number): Promise<any> {
    return this.executeWithRetry(async () => {
      return await this.client.futuresGetOrder({
        symbol,
        orderId,
      });
    }, 'getOrderStatus');
  }

  async getSymbolInfo(symbol: string): Promise<any> {
    // Check cache first
    const cached = this.symbolInfoCache.get(symbol);
    const cacheExpiry = this.symbolInfoCacheExpiry.get(symbol) || 0;
    
    if (cached && Date.now() < cacheExpiry) {
      return cached;
    }
    
    return this.executeWithRetry(async () => {
      const exchangeInfo = await this.client.futuresExchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
      
      if (symbolInfo) {
        // Cache for 5 minutes
        this.symbolInfoCache.set(symbol, symbolInfo);
        this.symbolInfoCacheExpiry.set(symbol, Date.now() + 5 * 60 * 1000);
      }
      
      return symbolInfo;
    }, 'getSymbolInfo');
  }

  async getMinOrderSize(symbol: string): Promise<{ 
    minQty: number; 
    stepSize: number;
    minPrice?: number;
    tickSize?: number;
    minNotional?: number;
  }> {
    return this.executeWithRetry(async () => {
      const symbolInfo = await this.getSymbolInfo(symbol);
      
      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found`);
      }
      
      const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
      const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      const minNotionalFilter = symbolInfo.filters.find((f: any) => f.filterType === 'MIN_NOTIONAL');
      
      if (!lotSizeFilter) {
        throw new Error(`LOT_SIZE filter not found for symbol ${symbol}`);
      }
      
      return {
        minQty: parseFloat(lotSizeFilter.minQty),
        stepSize: parseFloat(lotSizeFilter.stepSize),
        minPrice: priceFilter ? parseFloat(priceFilter.minPrice) : undefined,
        tickSize: priceFilter ? parseFloat(priceFilter.tickSize) : undefined,
        minNotional: minNotionalFilter ? parseFloat(minNotionalFilter.minNotional) : undefined,
      };
    }, 'getMinOrderSize');
  }

  formatQuantity(symbol: string, quantity: number): string {
    // This will be implemented properly with step size from symbol info
    // For now, use reasonable precision
    return quantity.toFixed(6);
  }

  formatPrice(symbol: string, price: number): string {
    // This will be implemented properly with tick size from symbol info
    // For now, use reasonable precision
    return price.toFixed(6);
  }

  async getAvailableBalance(): Promise<number> {
    return this.executeWithRetry(async () => {
      const accountInfo = await this.getAccountInfo();
      return parseFloat(accountInfo.availableBalance);
    }, 'getAvailableBalance');
  }

  async getTotalWalletBalance(): Promise<number> {
    return this.executeWithRetry(async () => {
      const accountInfo = await this.getAccountInfo();
      return parseFloat(accountInfo.totalWalletBalance);
    }, 'getTotalWalletBalance');
  }

  // WebSocket methods
  async initializeMarketStreams(symbols: string[], streamTypes: string[] = ['ticker', 'kline_1m']): Promise<void> {
    if (this.marketStreamManager) {
      this.marketStreamManager.disconnect();
    }
    
    this.marketStreamManager = createMarketStreamManager(this.config, symbols, streamTypes);
    await this.marketStreamManager.connect();
    
    console.log(`📡 Market streams initialized for symbols: ${symbols.join(', ')}`);
  }

  async initializeUserDataStream(): Promise<void> {
    // Get listen key for user data stream
    if (!this.userStreamListenKey) {
      this.userStreamListenKey = await this.createListenKey();
    }
    
    if (this.userStreamManager) {
      this.userStreamManager.disconnect();
    }
    
    this.userStreamManager = createUserDataStreamManager(this.config, this.userStreamListenKey);
    await this.userStreamManager.connect();
    
    console.log('📡 User data stream initialized');
    
    // Keep listen key alive
    setInterval(async () => {
      try {
        await this.keepAliveListenKey(this.userStreamListenKey!);
      } catch (error) {
        console.error('Failed to keep listen key alive:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  getMarketStreamManager(): BinanceWebSocketManager | null {
    return this.marketStreamManager;
  }

  getUserStreamManager(): BinanceWebSocketManager | null {
    return this.userStreamManager;
  }

  // Listen key management for user data streams
  private async createListenKey(): Promise<string> {
    // Check if any user data stream methods are available
    if (!this.client.futuresUserDataStreamStart && 
        !this.client.futuresGetDataStream && 
        !this.client.futuresListenKey && 
        !this.client.futuresUserDataStream) {
      throw new Error('User data stream methods not available in this API client version');
    }
    
    return this.executeWithRetry(async () => {
      // Try different possible method names for creating listen key
      if (this.client.futuresUserDataStreamStart) {
        const response = await this.client.futuresUserDataStreamStart();
        return response.listenKey;
      } else if (this.client.futuresGetDataStream) {
        const response = await this.client.futuresGetDataStream();
        return response.listenKey;
      } else if (this.client.futuresListenKey) {
        const response = await this.client.futuresListenKey();
        return response.listenKey || response;
      } else {
        // Fallback - try the original method name
        const response = await this.client.futuresUserDataStream();
        return response.listenKey;
      }
    }, 'createListenKey');
  }

  private async keepAliveListenKey(listenKey: string): Promise<void> {
    return this.executeWithRetry(async () => {
      if (this.client.futuresUserDataStreamKeepAlive) {
        await this.client.futuresUserDataStreamKeepAlive({ listenKey });
      } else if (this.client.futuresKeepDataStream) {
        await this.client.futuresKeepDataStream({ listenKey });
      } else {
        // This method might not be implemented - just log a warning
        console.warn('Keep-alive method not available, listen key may expire');
      }
    }, 'keepAliveListenKey');
  }

  // Error handling and retry logic
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries?: number
  ): Promise<T> {
    const retries = maxRetries || this.config.errorConfig?.maxRetries || 3;
    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        const binanceError = parseBinanceError(error);
        
        if (binanceError) {
          const errorResult = this.errorHandler.handleBinanceError(binanceError);
          
          // Log the error
          const logLevel = errorResult.logLevel;
          const message = `${operationName}: ${errorResult.message}`;
          
          if (logLevel === 'error') {
            console.error(`❌ ${message}`);
          } else if (logLevel === 'warn') {
            console.warn(`⚠️ ${message}`);
          } else {
            console.log(`ℹ️ ${message}`);
          }
          
          // Decide whether to retry
          if (!errorResult.shouldRetry || attempt === retries) {
            throw error;
          }
          
          // Wait before retry
          const delay = this.errorHandler.getRetryDelay(binanceError, attempt);
          console.log(`🔄 Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await this.sleep(delay);
          
        } else {
          // Non-Binance error - log and potentially retry
          console.error(`❌ ${operationName}: Unknown error:`, error.message);
          
          if (attempt === retries) {
            throw error;
          }
          
          // Simple exponential backoff for unknown errors
          const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
          console.log(`🔄 Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  // Order validation based on filters
  private async validateOrderParameters(
    symbol: string,
    type: OrderType,
    side: OrderSide,
    quantity: number,
    price?: number,
    timeInForce?: TimeInForce
  ): Promise<void> {
    const symbolInfo = await this.getSymbolInfo(symbol);
    
    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} is not available`);
    }
    
    if (symbolInfo.status !== 'TRADING') {
      throw new Error(`Symbol ${symbol} is not currently trading (status: ${symbolInfo.status})`);
    }
    
    // Validate quantity against LOT_SIZE filter
    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    if (lotSizeFilter) {
      const minQty = parseFloat(lotSizeFilter.minQty);
      const maxQty = parseFloat(lotSizeFilter.maxQty);
      const stepSize = parseFloat(lotSizeFilter.stepSize);
      
      if (quantity < minQty) {
        throw new Error(`Order quantity ${quantity} is below minimum ${minQty} for ${symbol}`);
      }
      
      if (maxQty > 0 && quantity > maxQty) {
        throw new Error(`Order quantity ${quantity} exceeds maximum ${maxQty} for ${symbol}`);
      }
      
      if (stepSize > 0) {
        const remainder = (quantity - minQty) % stepSize;
        if (Math.abs(remainder) > 1e-8) {
          throw new Error(`Order quantity ${quantity} does not match step size ${stepSize} for ${symbol}`);
        }
      }
    }
    
    // Validate price against PRICE_FILTER if price is specified
    if (price !== undefined) {
      const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      if (priceFilter) {
        const minPrice = parseFloat(priceFilter.minPrice);
        const maxPrice = parseFloat(priceFilter.maxPrice);
        const tickSize = parseFloat(priceFilter.tickSize);
        
        if (minPrice > 0 && price < minPrice) {
          throw new Error(`Order price ${price} is below minimum ${minPrice} for ${symbol}`);
        }
        
        if (maxPrice > 0 && price > maxPrice) {
          throw new Error(`Order price ${price} exceeds maximum ${maxPrice} for ${symbol}`);
        }
        
        if (tickSize > 0) {
          const remainder = price % tickSize;
          if (Math.abs(remainder) > 1e-8) {
            throw new Error(`Order price ${price} does not match tick size ${tickSize} for ${symbol}`);
          }
        }
      }
    }
    
    // Validate minimum notional
    const minNotionalFilter = symbolInfo.filters.find((f: any) => f.filterType === 'MIN_NOTIONAL');
    if (minNotionalFilter && price !== undefined) {
      const minNotional = parseFloat(minNotionalFilter.minNotional);
      const notional = quantity * price;
      
      if (notional < minNotional) {
        throw new Error(`Order notional ${notional} is below minimum ${minNotional} for ${symbol}`);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup method
  async disconnect(): Promise<void> {
    if (this.marketStreamManager) {
      this.marketStreamManager.disconnect();
    }
    
    if (this.userStreamManager) {
      this.userStreamManager.disconnect();
    }
    
    if (this.userStreamListenKey) {
      try {
        if (this.client.futuresUserDataStreamClose) {
          await this.client.futuresUserDataStreamClose({ listenKey: this.userStreamListenKey });
        } else if (this.client.futuresCloseDataStream) {
          await this.client.futuresCloseDataStream({ listenKey: this.userStreamListenKey });
        } else {
          console.warn('Close user data stream method not available');
        }
      } catch (error) {
        console.warn('Failed to close user data stream:', error);
      }
    }
    
    console.log('🔌 Binance client disconnected');
  }
}