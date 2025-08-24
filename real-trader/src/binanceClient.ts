import Binance from 'binance-api-node';
import type { 
  BinanceConfig, 
  BinanceOrderResponse, 
  BinancePosition, 
  BinanceAccountInfo 
} from './types.js';

export class BinanceClient {
  private client: any;
  private config: BinanceConfig;

  constructor(config: BinanceConfig) {
    this.config = config;
    
    // Initialize Binance client
    this.client = Binance({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      httpFutures: config.testnet 
        ? 'https://testnet.binancefuture.com' 
        : 'https://fapi.binance.com',
      wsFutures: config.testnet
        ? 'wss://stream.binancefuture.com'
        : 'wss://fstream.binance.com',
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.futuresTime();
      console.log(`✓ Binance ${this.config.testnet ? 'Testnet' : 'Mainnet'} connected successfully`);
      return true;
    } catch (error) {
      console.error('✗ Binance connection failed:', error);
      return false;
    }
  }

  async getAccountInfo(): Promise<BinanceAccountInfo> {
    try {
      return await this.client.futuresAccountInfo();
    } catch (error) {
      console.error('Failed to get account info:', error);
      throw error;
    }
  }

  async getPositions(): Promise<BinancePosition[]> {
    try {
      const accountInfo = await this.getAccountInfo();
      return accountInfo.positions.filter(p => parseFloat(p.positionAmt) !== 0);
    } catch (error) {
      console.error('Failed to get positions:', error);
      throw error;
    }
  }

  async getPosition(symbol: string): Promise<BinancePosition | null> {
    try {
      const positions = await this.getPositions();
      return positions.find(p => p.symbol === symbol) || null;
    } catch (error) {
      console.error(`Failed to get position for ${symbol}:`, error);
      throw error;
    }
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.client.futuresPrices({ symbol });
      return parseFloat(ticker[symbol]);
    } catch (error) {
      console.error(`Failed to get price for ${symbol}:`, error);
      throw error;
    }
  }

  async getCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
    try {
      const tickers = await this.client.futuresPrices();
      const result: Record<string, number> = {};
      
      for (const symbol of symbols) {
        if (tickers[symbol]) {
          result[symbol] = parseFloat(tickers[symbol]);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Failed to get prices:', error);
      throw error;
    }
  }

  async placeFuturesMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    options?: {
      leverage?: number;
      marginType?: 'isolated' | 'cross';
      positionSide?: 'LONG' | 'SHORT';
    }
  ): Promise<BinanceOrderResponse> {
    try {
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
        type: 'MARKET',
        quantity: quantity.toString(),
        positionSide: options?.positionSide || 'BOTH',
      });

      return order;
    } catch (error) {
      console.error(`Failed to place ${side} order for ${symbol}:`, error);
      throw error;
    }
  }

  async placeFuturesLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    options?: {
      leverage?: number;
      marginType?: 'isolated' | 'cross';
      positionSide?: 'LONG' | 'SHORT';
      timeInForce?: 'GTC' | 'IOC' | 'FOK';
    }
  ): Promise<BinanceOrderResponse> {
    try {
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
        type: 'LIMIT',
        quantity: quantity.toString(),
        price: price.toString(),
        timeInForce: options?.timeInForce || 'GTC',
        positionSide: options?.positionSide || 'BOTH',
      });

      return order;
    } catch (error) {
      console.error(`Failed to place ${side} limit order for ${symbol}:`, error);
      throw error;
    }
  }

  async placeStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    stopPrice: number,
    options?: {
      positionSide?: 'LONG' | 'SHORT';
    }
  ): Promise<BinanceOrderResponse> {
    try {
      const order = await this.client.futuresOrder({
        symbol,
        side,
        type: 'STOP_MARKET',
        quantity: quantity.toString(),
        stopPrice: stopPrice.toString(),
        positionSide: options?.positionSide || 'BOTH',
      });

      return order;
    } catch (error) {
      console.error(`Failed to place stop loss order for ${symbol}:`, error);
      throw error;
    }
  }

  async placeTakeProfitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    stopPrice: number,
    options?: {
      positionSide?: 'LONG' | 'SHORT';
    }
  ): Promise<BinanceOrderResponse> {
    try {
      const order = await this.client.futuresOrder({
        symbol,
        side,
        type: 'TAKE_PROFIT_MARKET',
        quantity: quantity.toString(),
        stopPrice: stopPrice.toString(),
        positionSide: options?.positionSide || 'BOTH',
      });

      return order;
    } catch (error) {
      console.error(`Failed to place take profit order for ${symbol}:`, error);
      throw error;
    }
  }

  async cancelOrder(symbol: string, orderId: number): Promise<any> {
    try {
      return await this.client.futuresCancelOrder({
        symbol,
        orderId,
      });
    } catch (error) {
      console.error(`Failed to cancel order ${orderId} for ${symbol}:`, error);
      throw error;
    }
  }

  async getOrderStatus(symbol: string, orderId: number): Promise<any> {
    try {
      return await this.client.futuresGetOrder({
        symbol,
        orderId,
      });
    } catch (error) {
      console.error(`Failed to get order status ${orderId} for ${symbol}:`, error);
      throw error;
    }
  }

  async getSymbolInfo(symbol: string): Promise<any> {
    try {
      const exchangeInfo = await this.client.futuresExchangeInfo();
      return exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
    } catch (error) {
      console.error(`Failed to get symbol info for ${symbol}:`, error);
      throw error;
    }
  }

  async getMinOrderSize(symbol: string): Promise<{ minQty: number; stepSize: number }> {
    try {
      const symbolInfo = await this.getSymbolInfo(symbol);
      const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
      
      return {
        minQty: parseFloat(lotSizeFilter.minQty),
        stepSize: parseFloat(lotSizeFilter.stepSize),
      };
    } catch (error) {
      console.error(`Failed to get min order size for ${symbol}:`, error);
      throw error;
    }
  }

  formatQuantity(symbol: string, quantity: number, stepSize: number): number {
    // Round quantity to match step size requirements
    const precision = stepSize.toString().split('.')[1]?.length || 0;
    return Math.floor(quantity / stepSize) * stepSize;
  }

  async getAvailableBalance(): Promise<number> {
    try {
      const accountInfo = await this.getAccountInfo();
      return parseFloat(accountInfo.availableBalance);
    } catch (error) {
      console.error('Failed to get available balance:', error);
      throw error;
    }
  }

  async getTotalWalletBalance(): Promise<number> {
    try {
      const accountInfo = await this.getAccountInfo();
      return parseFloat(accountInfo.totalWalletBalance);
    } catch (error) {
      console.error('Failed to get total wallet balance:', error);
      throw error;
    }
  }
}