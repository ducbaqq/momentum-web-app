import { Order, OrderStatus } from './Order.js';
import { ExchangeSpec, roundToTickSize, getDefaultSpecForSymbol } from './ExchangeSpec.js';
import type { Candle } from '../types.js';

export interface L1Snapshot {
  symbol: string;
  timestamp: number;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
}

export interface ExecutionContext {
  candle: Candle;
  l1Snapshot?: L1Snapshot;  // If available from l1_snapshots table
  timestamp: number;
}

export interface ExecutionResult {
  fillPrice: number;
  fillQuantity: number;
  commission: number;
  slippage: number;
  status: OrderStatus;
  rejectReason?: string;
}

export class Executor {
  constructor(
    private exchangeSpecs: Record<string, ExchangeSpec>,
    private slippageModelBps: number = 2  // Default 2 bps slippage
  ) {}

  // Execute order and return fill details
  executeOrder(order: Order, context: ExecutionContext): ExecutionResult {
    let spec = this.exchangeSpecs[order.symbol];
    if (!spec) {
      // Fallback default spec for unknown symbols
      spec = getDefaultSpecForSymbol(order.symbol);
      this.exchangeSpecs[order.symbol] = spec;
    }
    if (!spec) {
      return {
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        status: 'REJECTED',
        rejectReason: `No exchange spec for ${order.symbol}`
      };
    }

    // Validate order size
    if (order.quantity < spec.minOrderSize || order.quantity > spec.maxOrderSize) {
      return {
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        status: 'REJECTED',
        rejectReason: 'Invalid order size'
      };
    }

    return this.executeByType(order, context, spec);
  }

  private executeByType(order: Order, context: ExecutionContext, spec: ExchangeSpec): ExecutionResult {
    switch (order.type) {
      case 'MARKET':
        return this.executeMarketOrder(order, context, spec);
      case 'LIMIT':
        return this.executeLimitOrder(order, context, spec);
      default:
        return {
          fillPrice: 0,
          fillQuantity: 0,
          commission: 0,
          slippage: 0,
          status: 'REJECTED',
          rejectReason: `Order type ${order.type} not supported`
        };
    }
  }

  private executeMarketOrder(order: Order, context: ExecutionContext, spec: ExchangeSpec): ExecutionResult {
    // Determine reference price (prefer mark price for realism)
    const referencePrice = context.candle.close; // Using close as mark price approximation
    const isBuy = order.side === 'BUY';
    
    let fillPrice: number;
    let slippageBps = 0;

    if (context.l1Snapshot) {
      // Use order book if available
      fillPrice = isBuy ? context.l1Snapshot.askPrice : context.l1Snapshot.bidPrice;
      slippageBps = Math.abs((fillPrice - referencePrice) / referencePrice) * 10000;
      
      // Add additional slippage for market impact
      const marketImpactBps = this.calculateMarketImpact(order.quantity, context.l1Snapshot, spec);
      slippageBps += marketImpactBps;
      
      if (isBuy) {
        fillPrice += (fillPrice * marketImpactBps / 10000);
      } else {
        fillPrice -= (fillPrice * marketImpactBps / 10000);
      }
    } else {
      // Simple slippage model: use candle open + slippage
      const basePrice = context.candle.open;
      slippageBps = this.slippageModelBps;
      
      if (isBuy) {
        fillPrice = basePrice * (1 + slippageBps / 10000);
      } else {
        fillPrice = basePrice * (1 - slippageBps / 10000);
      }
    }

    // Round to tick size
    fillPrice = roundToTickSize(fillPrice, spec.tickSize);

    // Check price deviation limits
    const deviation = Math.abs((fillPrice - referencePrice) / referencePrice);
    if (deviation > spec.priceDeviationLimit) {
      return {
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        status: 'REJECTED',
        rejectReason: 'Price deviation exceeds limit'
      };
    }

    // Calculate commission (market orders are taker)
    const commission = (fillPrice * order.quantity * spec.takerFeeBps) / 10000;

    return {
      fillPrice,
      fillQuantity: order.quantity,
      commission,
      slippage: slippageBps,
      status: 'FILLED'
    };
  }

  private executeLimitOrder(order: Order, context: ExecutionContext, spec: ExchangeSpec): ExecutionResult {
    if (!order.price) {
      return {
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        status: 'REJECTED',
        rejectReason: 'Limit order missing price'
      };
    }

    const candle = context.candle;
    const limitPrice = roundToTickSize(order.price, spec.tickSize);
    const isBuy = order.side === 'BUY';

    // Simple fill logic: check if limit price was touched during the candle
    let wouldFill = false;
    
    if (isBuy) {
      // Buy limit fills if candle low <= limit price
      wouldFill = candle.low <= limitPrice;
    } else {
      // Sell limit fills if candle high >= limit price
      wouldFill = candle.high >= limitPrice;
    }

    if (!wouldFill) {
      return {
        fillPrice: 0,
        fillQuantity: 0,
        commission: 0,
        slippage: 0,
        status: 'PENDING'
      };
    }

    // Order fills at limit price (assuming sufficient liquidity)
    const fillPrice = limitPrice;
    
    // Limit orders are makers (usually)
    const feeBps = order.postOnly ? spec.makerFeeBps : 
                   (Math.random() > 0.7 ? spec.takerFeeBps : spec.makerFeeBps); // 70% maker, 30% taker
    
    const commission = (fillPrice * order.quantity * feeBps) / 10000;

    return {
      fillPrice,
      fillQuantity: order.quantity,
      commission,
      slippage: 0, // No slippage for limit orders
      status: 'FILLED'
    };
  }

  // Calculate market impact based on order size vs available liquidity
  private calculateMarketImpact(quantity: number, l1: L1Snapshot, spec: ExchangeSpec): number {
    // Simple model: impact increases with order size relative to available liquidity
    const availableLiquidity = Math.min(l1.bidSize, l1.askSize);
    const impactRatio = quantity / Math.max(availableLiquidity, quantity * 0.1);
    
    // Base impact of 0.5 bps, scales with impact ratio
    return Math.min(0.5 + impactRatio * 2, 20); // Cap at 20 bps
  }
}