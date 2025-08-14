import { Broker, BrokerState, TradeResult } from './Broker.js';
import { ExchangeSpec, BINANCE_SPECS } from './ExchangeSpec.js';
import { OrderSide } from './Order.js';
import { ExecutionContext } from './Executor.js';
import type { Candle } from '../types.js';

export interface EngineConfig {
  initialBalance: number;
  exchangeSpecs?: Record<string, ExchangeSpec>;
  positionMode?: 'ONE_WAY' | 'HEDGE';
  defaultLeverage?: number;
}

export interface EngineState extends BrokerState {
  currentBar: number;
  timestamp: number;
  totalTrades: number;
  totalCommissions: number;
  totalFunding: number;
}

export interface TradeSignal {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;           // Position size (not order quantity)
  type?: 'MARKET' | 'LIMIT';
  price?: number;         // For limit orders
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface EngineResult {
  finalBalance: number;
  totalPnl: number;
  totalTrades: number;
  totalCommissions: number;
  totalFunding: number;
  maxDrawdown: number;
  sharpeRatio: number;
  positions: any[];
  equityCurve: { timestamp: number; equity: number; balance: number; unrealizedPnl: number }[];
  trades: any[];
  liquidations: number;
}

export class Engine {
  private broker: Broker;
  private config: EngineConfig;
  private currentBar: number = 0;
  private trades: any[] = [];
  private equityCurve: any[] = [];
  private liquidationCount: number = 0;

  constructor(config: EngineConfig) {
    this.config = {
      exchangeSpecs: BINANCE_SPECS,
      positionMode: 'ONE_WAY',
      defaultLeverage: 1,
      ...config
    };
    // Ensure defaults are preserved when undefined is passed in
    if (!this.config.exchangeSpecs) {
      this.config.exchangeSpecs = BINANCE_SPECS;
    }

    this.broker = new Broker(config.initialBalance, this.config.exchangeSpecs!);
    this.broker.setPositionMode(this.config.positionMode!);
  }

  // Process a single bar
  processBar(candle: Candle, signals: TradeSignal[], l1Snapshot?: any): EngineState {
    this.currentBar++;
    const timestamp = new Date(candle.ts).getTime();

    // Update mark prices (using candle close as mark price)
    const markPrices = { [candle.symbol || 'UNKNOWN']: candle.close };
    const fundingPayments = this.broker.updateMarkPrices(markPrices, timestamp);

    // Process trading signals
    for (const signal of signals) {
      const result = this.executeSignal(signal, candle, timestamp, l1Snapshot);
      if (result.success && result.order) {
        this.trades.push({
          ...result.order,
          execution: result.execution,
          position: result.position,
          fundingPayments: result.fundingPayments
        });

        if (result.liquidated) {
          this.liquidationCount++;
        }
      }
    }

    // Record equity curve
    const brokerState = this.broker.getState();
    this.equityCurve.push({
      timestamp,
      equity: brokerState.totalEquity,
      balance: brokerState.balance,
      unrealizedPnl: brokerState.unrealizedPnl,
      usedMargin: brokerState.usedMargin,
      availableMargin: brokerState.availableMargin
    });

    return {
      ...brokerState,
      currentBar: this.currentBar,
      timestamp,
      totalTrades: this.trades.length,
      totalCommissions: this.calculateTotalCommissions(),
      totalFunding: this.calculateTotalFunding()
    };
  }

  // Execute a trading signal
  protected executeSignal(
    signal: TradeSignal,
    candle: Candle,
    timestamp: number,
    l1Snapshot?: any
  ): TradeResult {
    const context: ExecutionContext = {
      candle,
      l1Snapshot,
      timestamp
    };

    const leverage = signal.leverage || this.config.defaultLeverage || 1;
    
    // Convert position signal to order
    const currentPosition = this.broker.getPosition(signal.symbol);
    const currentSize = currentPosition ? 
      (currentPosition.side === 'LONG' ? currentPosition.size : -currentPosition.size) : 0;
    
    // Calculate required order to reach target position
    const targetSize = signal.side === 'LONG' ? signal.size : -signal.size;
    const orderSize = Math.abs(targetSize - currentSize);
    
    if (orderSize < 0.001) {
      return { success: false, error: 'No position change required' };
    }

    const orderSide: OrderSide = targetSize > currentSize ? 'BUY' : 'SELL';

    if (signal.type === 'LIMIT' && signal.price) {
      // TODO: Implement limit orders
      return { success: false, error: 'Limit orders not yet implemented' };
    }

    // Execute market order
    return this.broker.marketOrder(
      signal.symbol,
      orderSide,
      orderSize,
      context,
      leverage
    );
  }

  // Run backtest on historical data
  async runBacktest(
    candles: Candle[],
    strategy: (candle: Candle, index: number, state: EngineState) => TradeSignal[]
  ): Promise<EngineResult> {
    console.log(`Starting backtest with ${candles.length} candles`);

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      
      // Get current state
      const state = this.getState(candle);
      
      // Generate signals from strategy
      const signals = strategy(candle, i, state);
      
      // Process the bar
      this.processBar(candle, signals);
    }

    return this.getResults();
  }

  // Get current engine state
  protected getState(candle: Candle): EngineState {
    const brokerState = this.broker.getState();
    return {
      ...brokerState,
      currentBar: this.currentBar,
      timestamp: new Date(candle.ts).getTime(),
      totalTrades: this.trades.length,
      totalCommissions: this.calculateTotalCommissions(),
      totalFunding: this.calculateTotalFunding()
    };
  }

  // Calculate performance metrics
  protected getResults(): EngineResult {
    const brokerState = this.broker.getState();
    const initialBalance = this.config.initialBalance;
    const totalPnl = brokerState.totalEquity - initialBalance;
    
    const equityValues = this.equityCurve.map(point => point.equity);
    const maxDrawdown = this.calculateMaxDrawdown(equityValues);
    const sharpeRatio = this.calculateSharpeRatio(equityValues);

    return {
      finalBalance: brokerState.balance,
      totalPnl,
      totalTrades: this.trades.length,
      totalCommissions: this.calculateTotalCommissions(),
      totalFunding: this.calculateTotalFunding(),
      maxDrawdown,
      sharpeRatio,
      positions: this.broker.getPositions(),
      equityCurve: this.equityCurve,
      trades: this.trades,
      liquidations: this.liquidationCount
    };
  }

  // Calculate maximum drawdown
  private calculateMaxDrawdown(equityValues: number[]): number {
    let maxDrawdown = 0;
    let peak = equityValues[0] || 0;

    for (const equity of equityValues) {
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  // Calculate Sharpe ratio (simplified)
  private calculateSharpeRatio(equityValues: number[]): number {
    if (equityValues.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < equityValues.length; i++) {
      const ret = (equityValues[i] - equityValues[i-1]) / equityValues[i-1];
      returns.push(ret);
    }

    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev === 0 ? 0 : (avgReturn * Math.sqrt(252)) / (stdDev * Math.sqrt(252)); // Annualized
  }

  // Calculate totals
  private calculateTotalCommissions(): number {
    return this.trades.reduce((sum, trade) => sum + (trade.commission || 0), 0);
  }

  private calculateTotalFunding(): number {
    return this.trades.reduce((sum, trade) => {
      const fundingPayments = trade.fundingPayments || [];
      return sum + fundingPayments.reduce((fSum: number, payment: any) => fSum + payment.payment, 0);
    }, 0);
  }

  // Get broker instance (for advanced usage)
  getBroker(): Broker {
    return this.broker;
  }
}