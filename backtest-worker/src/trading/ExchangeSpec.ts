// Exchange specifications for each symbol
export interface RiskTier {
  maxNotional: number;     // Max position notional for this tier
  initialMarginRate: number;  // Initial margin requirement (e.g., 0.01 = 1%)
  maintenanceMarginRate: number; // Maintenance margin requirement
}

export interface ExchangeSpec {
  symbol: string;
  
  // Order sizing
  tickSize: number;        // Min price increment (e.g., 0.01)
  lotSize: number;         // Min quantity increment (e.g., 0.001)
  minOrderSize: number;    // Min order quantity
  maxOrderSize: number;    // Max order quantity
  
  // Leverage
  maxLeverage: number;     // Max leverage allowed
  leverageStep: number;    // Leverage increment step
  
  // Fees (in bps - basis points, 1 bps = 0.01%)
  makerFeeBps: number;     // Fee for maker orders
  takerFeeBps: number;     // Fee for taker orders
  
  // Risk management tiers
  riskTiers: RiskTier[];
  
  // Funding rate settings
  fundingInterval: number; // Funding interval in hours (typically 8)
  maxFundingRate: number;  // Max funding rate cap (e.g., 0.75%)
  
  // Price limits
  priceDeviationLimit: number; // Max deviation from mark price (e.g., 0.1 = 10%)
}

// Default Binance-like specifications
export const BINANCE_SPECS: Record<string, ExchangeSpec> = {
  'BTCUSDT': {
    symbol: 'BTCUSDT',
    tickSize: 0.1,
    lotSize: 0.001,
    minOrderSize: 0.001,
    maxOrderSize: 1000,
    maxLeverage: 125,
    leverageStep: 1,
    makerFeeBps: 2,     // 0.02%
    takerFeeBps: 4,     // 0.04%
    riskTiers: [
      { maxNotional: 50000, initialMarginRate: 0.004, maintenanceMarginRate: 0.002 },    // Up to $50k: 0.4% initial, 0.2% maintenance
      { maxNotional: 250000, initialMarginRate: 0.005, maintenanceMarginRate: 0.0025 },  // Up to $250k: 0.5% initial, 0.25% maintenance
      { maxNotional: 1000000, initialMarginRate: 0.01, maintenanceMarginRate: 0.005 },   // Up to $1M: 1% initial, 0.5% maintenance
      { maxNotional: 5000000, initialMarginRate: 0.025, maintenanceMarginRate: 0.0125 }, // Up to $5M: 2.5% initial, 1.25% maintenance
      { maxNotional: Infinity, initialMarginRate: 0.05, maintenanceMarginRate: 0.025 },  // Above $5M: 5% initial, 2.5% maintenance
    ],
    fundingInterval: 8,
    maxFundingRate: 0.0075, // 0.75%
    priceDeviationLimit: 0.1,
  },
  'ETHUSDT': {
    symbol: 'ETHUSDT',
    tickSize: 0.01,
    lotSize: 0.001,
    minOrderSize: 0.001,
    maxOrderSize: 10000,
    maxLeverage: 100,
    leverageStep: 1,
    makerFeeBps: 2,
    takerFeeBps: 4,
    riskTiers: [
      { maxNotional: 25000, initialMarginRate: 0.005, maintenanceMarginRate: 0.0025 },
      { maxNotional: 100000, initialMarginRate: 0.0075, maintenanceMarginRate: 0.00375 },
      { maxNotional: 500000, initialMarginRate: 0.01, maintenanceMarginRate: 0.005 },
      { maxNotional: 1000000, initialMarginRate: 0.025, maintenanceMarginRate: 0.0125 },
      { maxNotional: Infinity, initialMarginRate: 0.05, maintenanceMarginRate: 0.025 },
    ],
    fundingInterval: 8,
    maxFundingRate: 0.0075,
    priceDeviationLimit: 0.1,
  }
};

// Get risk tier for a given position notional
export function getRiskTier(spec: ExchangeSpec, notional: number): RiskTier {
  for (const tier of spec.riskTiers) {
    if (notional <= tier.maxNotional) {
      return tier;
    }
  }
  return spec.riskTiers[spec.riskTiers.length - 1]; // Return highest tier if exceeds all
}

// Round price to tick size
export function roundToTickSize(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

// Round quantity to lot size
export function roundToLotSize(quantity: number, lotSize: number): number {
  return Math.floor(quantity / lotSize) * lotSize;
}

// Validate order size
export function validateOrderSize(quantity: number, spec: ExchangeSpec): number {
  const rounded = roundToLotSize(Math.abs(quantity), spec.lotSize);
  return Math.max(spec.minOrderSize, Math.min(spec.maxOrderSize, rounded));
}