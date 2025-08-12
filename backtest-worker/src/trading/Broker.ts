import { Position, PositionSide, MarginMode, createPosition, calculateUnrealizedPnl, getPositionNotional, isLiquidatable, calculateLiquidationPrice } from './Position.js';
import { Order, OrderSide, createMarketOrder } from './Order.js';
import { ExchangeSpec, getRiskTier, validateOrderSize } from './ExchangeSpec.js';
import { Executor, ExecutionContext, ExecutionResult } from './Executor.js';

export interface BrokerState {
  balance: number;              // Available cash balance
  unrealizedPnl: number;       // Total unrealized PnL across all positions
  usedMargin: number;          // Total margin currently in use
  availableMargin: number;     // Available margin for new positions
  totalEquity: number;         // balance + unrealizedPnl
}

export interface FundingPayment {
  symbol: string;
  rate: number;      // Funding rate (e.g., 0.0001 = 0.01%)
  payment: number;   // Actual payment amount
  timestamp: number;
}

export interface TradeResult {
  success: boolean;
  order?: Order;
  execution?: ExecutionResult;
  position?: Position;
  error?: string;
  liquidated?: boolean;
  fundingPayments?: FundingPayment[];
}

export class Broker {
  private balance: number;
  private positions: Map<string, Position> = new Map();
  private executor: Executor;
  private positionMode: 'ONE_WAY' | 'HEDGE' = 'ONE_WAY';
  
  // Funding rate cache (in practice would come from database)
  private fundingRates: Map<string, { rate: number; timestamp: number }> = new Map();

  constructor(
    initialBalance: number,
    private exchangeSpecs: Record<string, ExchangeSpec>,
    executor?: Executor
  ) {
    this.balance = initialBalance;
    this.executor = executor || new Executor(exchangeSpecs);
  }

  // Get current broker state
  getState(): BrokerState {
    const unrealizedPnl = this.calculateTotalUnrealizedPnl();
    const usedMargin = this.calculateTotalUsedMargin();
    const totalEquity = this.balance + unrealizedPnl;
    
    return {
      balance: this.balance,
      unrealizedPnl,
      usedMargin,
      availableMargin: Math.max(0, totalEquity - usedMargin),
      totalEquity
    };
  }

  // Submit market order
  marketOrder(
    symbol: string,
    side: OrderSide,
    quantity: number,
    context: ExecutionContext,
    leverage: number = 1,
    marginMode: MarginMode = 'CROSS'
  ): TradeResult {
    const spec = this.exchangeSpecs[symbol];
    if (!spec) {
      return { success: false, error: `No exchange spec for ${symbol}` };
    }

    // Validate and adjust quantity
    const validQuantity = validateOrderSize(quantity, spec);
    if (validQuantity === 0) {
      return { success: false, error: 'Invalid order size' };
    }

    // Create and execute order
    const order = createMarketOrder(symbol, side, validQuantity, context.timestamp);
    const execution = this.executor.executeOrder(order, context);
    
    if (execution.status !== 'FILLED') {
      return { 
        success: false, 
        order, 
        execution, 
        error: execution.rejectReason || 'Order not filled' 
      };
    }

    // Update order with execution details
    order.status = 'FILLED';
    order.filledQuantity = execution.fillQuantity;
    order.averageFillPrice = execution.fillPrice;
    order.commission = execution.commission;
    order.fillTime = context.timestamp;

    // Update position
    const position = this.updatePosition(
      symbol, 
      side, 
      execution.fillQuantity, 
      execution.fillPrice,
      context.candle.close, // Use close as mark price
      leverage,
      marginMode,
      context.timestamp
    );

    if (!position) {
      return { success: false, error: 'Failed to update position' };
    }

    // Deduct commission
    this.balance -= execution.commission;

    // Check for liquidation
    const liquidated = this.checkLiquidation(symbol, context);

    return {
      success: true,
      order,
      execution,
      position,
      liquidated
    };
  }

  // Update position with new trade
  private updatePosition(
    symbol: string,
    side: OrderSide,
    quantity: number,
    price: number,
    markPrice: number,
    leverage: number,
    marginMode: MarginMode,
    timestamp: number
  ): Position | null {
    const positionKey = this.getPositionKey(symbol, marginMode);
    const existing = this.positions.get(positionKey);
    
    const spec = this.exchangeSpecs[symbol];
    if (!spec) return null;

    const isBuy = side === 'BUY';
    const tradeDirection = isBuy ? 1 : -1;
    const tradeSize = quantity * tradeDirection;

    if (!existing) {
      // New position
      const positionSide: PositionSide = isBuy ? 'LONG' : 'SHORT';
      const position = createPosition(
        symbol, 
        positionSide, 
        quantity, 
        price, 
        markPrice, 
        leverage, 
        marginMode, 
        timestamp
      );
      
      // Calculate margin requirements
      this.updateMarginRequirements(position);
      
      this.positions.set(positionKey, position);
      return position;
    }

    // Update existing position
    const currentSize = existing.side === 'LONG' ? existing.size : -existing.size;
    const newSize = currentSize + tradeSize;

    if (Math.abs(newSize) < 0.000001) {
      // Position closed
      existing.realizedPnl += this.calculateRealizedPnl(existing, quantity, price);
      this.balance += existing.realizedPnl;
      this.positions.delete(positionKey);
      return null;
    }

    if (Math.sign(newSize) !== Math.sign(currentSize) && currentSize !== 0) {
      // Position flipped sides
      const closedQuantity = Math.abs(currentSize);
      existing.realizedPnl += this.calculateRealizedPnl(existing, closedQuantity, price);
      this.balance += existing.realizedPnl;
      
      // Create new position with remaining size
      const remainingQuantity = Math.abs(newSize);
      const newSide: PositionSide = newSize > 0 ? 'LONG' : 'SHORT';
      const newPosition = createPosition(
        symbol, 
        newSide, 
        remainingQuantity, 
        price, 
        markPrice, 
        leverage, 
        marginMode, 
        timestamp
      );
      
      this.updateMarginRequirements(newPosition);
      this.positions.set(positionKey, newPosition);
      return newPosition;
    }

    // Add to existing position (same side)
    const totalNotional = existing.size * existing.entryPrice + quantity * price;
    const totalSize = existing.size + quantity;
    existing.entryPrice = totalNotional / totalSize;
    existing.size = Math.abs(newSize);
    existing.markPrice = markPrice;
    existing.lastUpdateTime = timestamp;

    this.updateMarginRequirements(existing);
    return existing;
  }

  // Calculate realized PnL for a partial close
  private calculateRealizedPnl(position: Position, closedQuantity: number, closePrice: number): number {
    const priceDiff = closePrice - position.entryPrice;
    const multiplier = position.side === 'LONG' ? 1 : -1;
    return closedQuantity * priceDiff * multiplier;
  }

  // Update margin requirements based on risk tiers
  private updateMarginRequirements(position: Position): void {
    const spec = this.exchangeSpecs[position.symbol];
    if (!spec) return;

    const notional = getPositionNotional(position);
    const riskTier = getRiskTier(spec, notional);
    
    position.initialMargin = notional * riskTier.initialMarginRate;
    position.maintenanceMargin = notional * riskTier.maintenanceMarginRate;
  }

  // Update mark prices and unrealized PnL
  updateMarkPrices(markPrices: Record<string, number>, timestamp: number): FundingPayment[] {
    const fundingPayments: FundingPayment[] = [];

    for (const [key, position] of this.positions) {
      const newMarkPrice = markPrices[position.symbol];
      if (newMarkPrice) {
        position.markPrice = newMarkPrice;
        position.unrealizedPnl = calculateUnrealizedPnl(position, newMarkPrice);
        position.lastUpdateTime = timestamp;

        // Process funding payments
        const funding = this.processFunding(position, timestamp);
        if (funding) {
          fundingPayments.push(funding);
        }
      }
    }

    return fundingPayments;
  }

  // Process funding payments
  private processFunding(position: Position, timestamp: number): FundingPayment | null {
    const spec = this.exchangeSpecs[position.symbol];
    if (!spec) return null;

    const hoursSinceLastFunding = (timestamp - position.lastFundingTime) / (1000 * 60 * 60);
    
    if (hoursSinceLastFunding >= spec.fundingInterval) {
      const fundingRate = this.getCurrentFundingRate(position.symbol, timestamp);
      const notional = getPositionNotional(position);
      const payment = notional * fundingRate * (position.side === 'LONG' ? -1 : 1);

      position.accumulatedFunding += payment;
      position.lastFundingTime = timestamp;
      this.balance += payment;

      return {
        symbol: position.symbol,
        rate: fundingRate,
        payment,
        timestamp
      };
    }

    return null;
  }

  // Get current funding rate (simplified - would query from database)
  private getCurrentFundingRate(symbol: string, timestamp: number): number {
    // Simplified: return a small positive rate (0.01% = 0.0001)
    // In practice, this would come from historical funding rate data
    return 0.0001;
  }

  // Check for liquidations
  private checkLiquidation(symbol: string, context: ExecutionContext): boolean {
    const positionKey = this.getPositionKey(symbol, 'CROSS'); // Check cross positions
    const position = this.positions.get(positionKey);
    
    if (!position) return false;

    const state = this.getState();
    
    if (isLiquidatable(position, state.availableMargin)) {
      // Force liquidation
      this.liquidatePosition(position, context);
      return true;
    }

    return false;
  }

  // Force liquidate a position
  private liquidatePosition(position: Position, context: ExecutionContext): void {
    const liquidationSide: OrderSide = position.side === 'LONG' ? 'SELL' : 'BUY';
    
    // Create liquidation order at market
    this.marketOrder(
      position.symbol,
      liquidationSide,
      position.size,
      context,
      position.leverage,
      position.marginMode
    );
  }

  // Calculate total unrealized PnL
  private calculateTotalUnrealizedPnl(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.unrealizedPnl;
    }
    return total;
  }

  // Calculate total used margin
  private calculateTotalUsedMargin(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.initialMargin;
    }
    return total;
  }

  // Get position key for storage
  private getPositionKey(symbol: string, marginMode: MarginMode): string {
    if (this.positionMode === 'HEDGE') {
      return `${symbol}_${marginMode}`;
    }
    return symbol; // ONE_WAY mode
  }

  // Get all positions
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  // Get specific position
  getPosition(symbol: string, marginMode: MarginMode = 'CROSS'): Position | null {
    const key = this.getPositionKey(symbol, marginMode);
    return this.positions.get(key) || null;
  }

  // Set position mode
  setPositionMode(mode: 'ONE_WAY' | 'HEDGE'): void {
    this.positionMode = mode;
  }

  // Add funding rate (for testing)
  setFundingRate(symbol: string, rate: number, timestamp: number): void {
    this.fundingRates.set(symbol, { rate, timestamp });
  }
}