export type PositionSide = 'LONG' | 'SHORT';
export type MarginMode = 'CROSS' | 'ISOLATED';

export interface Position {
  symbol: string;
  side: PositionSide;
  size: number;           // Position size (always positive)
  entryPrice: number;     // Average entry price
  markPrice: number;      // Current mark price for PnL calculation
  marginMode: MarginMode;
  leverage: number;
  
  // P&L tracking
  unrealizedPnl: number;  // Current unrealized P&L based on mark price
  realizedPnl: number;    // Cumulative realized P&L from closes
  
  // Margin tracking
  initialMargin: number;  // Required initial margin
  maintenanceMargin: number; // Required maintenance margin
  isolatedMargin?: number;   // For isolated mode only
  
  // Funding tracking
  lastFundingTime: number;   // Timestamp of last funding payment
  accumulatedFunding: number; // Cumulative funding payments
  
  // Timestamps
  openTime: number;
  lastUpdateTime: number;
}

export function createPosition(
  symbol: string,
  side: PositionSide,
  size: number,
  entryPrice: number,
  markPrice: number,
  leverage: number,
  marginMode: MarginMode = 'CROSS',
  timestamp: number = Date.now(),
  isolatedMargin?: number
): Position {
  const notional = size * entryPrice;
  
  return {
    symbol,
    side,
    size,
    entryPrice,
    markPrice,
    marginMode,
    leverage,
    unrealizedPnl: 0,
    realizedPnl: 0,
    initialMargin: notional / leverage,
    maintenanceMargin: 0, // Will be calculated by broker
    isolatedMargin,
    lastFundingTime: timestamp,
    accumulatedFunding: 0,
    openTime: timestamp,
    lastUpdateTime: timestamp
  };
}

// Calculate unrealized PnL based on mark price
export function calculateUnrealizedPnl(position: Position, currentMarkPrice: number): number {
  const priceDiff = currentMarkPrice - position.entryPrice;
  const multiplier = position.side === 'LONG' ? 1 : -1;
  return position.size * priceDiff * multiplier;
}

// Calculate position notional value
export function getPositionNotional(position: Position, price?: number): number {
  return position.size * (price ?? position.markPrice);
}

// Check if position can be liquidated
export function isLiquidatable(position: Position, availableMargin: number): boolean {
  const requiredMargin = position.maintenanceMargin;
  return availableMargin < requiredMargin;
}

// Calculate liquidation price
export function calculateLiquidationPrice(
  position: Position, 
  availableBalance: number, 
  maintenanceMarginRate: number
): number {
  const { side, size, entryPrice, leverage } = position;
  const notional = size * entryPrice;
  const initialMargin = notional / leverage;
  
  if (side === 'LONG') {
    // Long liquidation: markPrice * (1 - maintenanceMarginRate) * size = availableBalance + realizedPnl
    return (availableBalance + position.realizedPnl + initialMargin) / (size * (1 - maintenanceMarginRate));
  } else {
    // Short liquidation: markPrice * (1 + maintenanceMarginRate) * size = availableBalance + realizedPnl  
    return (availableBalance + position.realizedPnl + initialMargin) / (size * (1 + maintenanceMarginRate));
  }
}