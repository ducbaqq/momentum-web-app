export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK'; // Good Till Cancel, Immediate Or Cancel, Fill Or Kill

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;        // For limit orders
  stopPrice?: number;    // For stop orders
  timeInForce: TimeInForce;
  
  // Execution details
  status: OrderStatus;
  filledQuantity: number;
  averageFillPrice: number;
  
  // Fees
  commission: number;
  commissionAsset: string;
  
  // Timestamps
  orderTime: number;
  fillTime?: number;
  
  // Metadata
  clientOrderId?: string;
  reduceOnly?: boolean;  // For closing positions only
  postOnly?: boolean;    // Maker-only orders
}

export function createMarketOrder(
  symbol: string,
  side: OrderSide,
  quantity: number,
  timestamp: number = Date.now(),
  clientOrderId?: string,
  reduceOnly: boolean = false
): Order {
  return {
    id: generateOrderId(),
    symbol,
    side,
    type: 'MARKET',
    quantity,
    timeInForce: 'IOC',
    status: 'PENDING',
    filledQuantity: 0,
    averageFillPrice: 0,
    commission: 0,
    commissionAsset: 'USDT',
    orderTime: timestamp,
    clientOrderId,
    reduceOnly
  };
}

export function createLimitOrder(
  symbol: string,
  side: OrderSide,
  quantity: number,
  price: number,
  timestamp: number = Date.now(),
  timeInForce: TimeInForce = 'GTC',
  clientOrderId?: string,
  reduceOnly: boolean = false,
  postOnly: boolean = false
): Order {
  return {
    id: generateOrderId(),
    symbol,
    side,
    type: 'LIMIT',
    quantity,
    price,
    timeInForce,
    status: 'PENDING',
    filledQuantity: 0,
    averageFillPrice: 0,
    commission: 0,
    commissionAsset: 'USDT',
    orderTime: timestamp,
    clientOrderId,
    reduceOnly,
    postOnly
  };
}

function generateOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate if order reduces position
export function isReducingPosition(order: Order, currentPositionSize: number): boolean {
  if (order.reduceOnly) return true;
  
  const orderDirection = order.side === 'BUY' ? 1 : -1;
  const positionDirection = currentPositionSize >= 0 ? 1 : -1;
  
  return orderDirection !== positionDirection && Math.abs(currentPositionSize) > 0;
}