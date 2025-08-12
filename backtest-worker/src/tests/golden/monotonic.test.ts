import { Broker } from '../../trading/Broker.js';
import { BINANCE_SPECS } from '../../trading/ExchangeSpec.js';

// Helper to generate deterministic toy candles
function generateMonotonicCandles(
  startPrice: number, 
  dailyChangePercent: number, 
  days: number, 
  startTime: number = Date.now()
): any[] {
  const candles = [];
  let currentPrice = startPrice;
  
  for (let day = 0; day < days; day++) {
    const timestamp = startTime + (day * 24 * 60 * 60 * 1000); // Daily candles
    const changeMultiplier = 1 + (dailyChangePercent / 100);
    const nextPrice = currentPrice * changeMultiplier;
    
    // Simple OHLC: Open=current, Close=next, High/Low with small variance
    const open = currentPrice;
    const close = nextPrice;
    const high = Math.max(open, close) * 1.001; // 0.1% wick
    const low = Math.min(open, close) * 0.999;  // 0.1% wick
    
    candles.push({
      timestamp,
      open,
      high, 
      low,
      close,
      volume: 1000, // Constant volume
      
      // Add some basic features for strategy compatibility
      roc_1m: dailyChangePercent,
      roc_5m: dailyChangePercent,
      vol_mult: 1.0,
      spread_bps: 2, // 2 basis points spread
      rsi_14: dailyChangePercent > 0 ? 70 : 30 // Simple RSI approximation
    });
    
    currentPrice = nextPrice;
  }
  
  return candles;
}

describe('Golden Tests - Monotonic Price Movements', () => {
  describe('Monotonic Uptrend - Long Positions', () => {
    test('Long position profits in consistent uptrend (without funding)', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyGain = 1; // 1% daily
      const days = 30;
      
      // Generate toy candles: 30 days of 1% gains
      const candles = generateMonotonicCandles(startPrice, dailyGain, days);
      
      const baseTime = Date.now();
      
      // Open long position on day 1
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 10, 'CROSS');
      expect(result.success).toBe(true);
      
      // Track equity over time (no funding payments for simplicity)
      const equityCurve: { day: number; equity: number; price: number }[] = [];
      
      for (let day = 0; day < days; day++) {
        const currentCandle = candles[day];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        
        broker.updateMarkPrices(markPrices, baseTime + (day * 24 * 60 * 60 * 1000));
        
        const state = broker.getState();
        equityCurve.push({
          day,
          equity: state.totalEquity,
          price: currentCandle.close
        });
      }
      
      // Expected results for monotonic uptrend
      const finalEquity = equityCurve[equityCurve.length - 1].equity;
      const finalPrice = equityCurve[equityCurve.length - 1].price;
      const initialEquity = equityCurve[0].equity;
      
      // After 30 days of 1% daily gains: (1.01)^30 ≈ 1.348
      const expectedPriceMultiplier = Math.pow(1.01, 30);
      const expectedFinalPrice = startPrice * expectedPriceMultiplier;
      
      expect(finalPrice).toBeCloseTo(expectedFinalPrice, -2); // ~$67,400
      expect(finalEquity).toBeGreaterThan(initialEquity); // Should be profitable
      
      // Long position with 10x leverage should have ~10x the price gain in equity
      const priceGainPercent = (finalPrice - startPrice) / startPrice;
      const equityGainPercent = (finalEquity - initialEquity) / initialEquity;
      
      expect(equityGainPercent).toBeGreaterThan(priceGainPercent * 8); // Approximately 10x leverage effect (minus fees)
      expect(equityGainPercent).toBeLessThan(priceGainPercent * 12); // Within reasonable bounds
    });

    test('Short position loses in consistent uptrend', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyGain = 1; // 1% daily uptrend
      const days = 20; // Shorter duration to avoid liquidation
      
      const candles = generateMonotonicCandles(startPrice, dailyGain, days);
      const baseTime = Date.now();
      
      // Open short position
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'SELL', 1.0, context, 5, 'CROSS'); // Lower leverage
      expect(result.success).toBe(true);
      
      // Track performance
      let finalEquity = 0;
      
      for (let day = 0; day < days; day++) {
        const currentCandle = candles[day];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        
        broker.updateMarkPrices(markPrices, baseTime + (day * 24 * 60 * 60 * 1000));
        
        const state = broker.getState();
        finalEquity = state.totalEquity;
        
        // Check if position still exists (not liquidated)
        const position = broker.getPosition('BTCUSDT');
        if (!position) {
          break; // Position was liquidated
        }
      }
      
      // Short position should lose money in uptrend
      expect(finalEquity).toBeLessThan(10000); // Lost money
      
      // Loss should be proportional to price movement and leverage
      const position = broker.getPosition('BTCUSDT');
      if (position) {
        expect(position.unrealizedPnl).toBeLessThan(0); // Negative P&L
      }
    });
  });

  describe('Monotonic Downtrend - Short Positions', () => {
    test('Short position profits in consistent downtrend', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyLoss = -1; // 1% daily decline
      const days = 30;
      
      const candles = generateMonotonicCandles(startPrice, dailyLoss, days);
      const baseTime = Date.now();
      
      // Open short position
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'SELL', 1.0, context, 10, 'CROSS');
      expect(result.success).toBe(true);
      
      // Track equity
      let finalEquity = 0;
      let finalPrice = 0;
      
      for (let day = 0; day < days; day++) {
        const currentCandle = candles[day];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        
        broker.updateMarkPrices(markPrices, baseTime + (day * 24 * 60 * 60 * 1000));
        
        const state = broker.getState();
        finalEquity = state.totalEquity;
        finalPrice = currentCandle.close;
      }
      
      // After 30 days of 1% daily losses: (0.99)^30 ≈ 0.740
      const expectedPriceMultiplier = Math.pow(0.99, 30);
      const expectedFinalPrice = startPrice * expectedPriceMultiplier;
      
      expect(finalPrice).toBeCloseTo(expectedFinalPrice, -2); // ~$37,000
      expect(finalEquity).toBeGreaterThan(10000); // Should be profitable
      
      // Short position profits when price goes down
      const position = broker.getPosition('BTCUSDT');
      expect(position?.unrealizedPnl).toBeGreaterThan(0); // Positive P&L
    });

    test('Long position loses in consistent downtrend', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyLoss = -1; // 1% daily decline
      const days = 20; // Shorter to avoid liquidation
      
      const candles = generateMonotonicCandles(startPrice, dailyLoss, days);
      const baseTime = Date.now();
      
      // Open long position with lower leverage
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 5, 'CROSS');
      expect(result.success).toBe(true);
      
      // Track performance
      let finalEquity = 0;
      
      for (let day = 0; day < days; day++) {
        const currentCandle = candles[day];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        
        broker.updateMarkPrices(markPrices, baseTime + (day * 24 * 60 * 60 * 1000));
        
        const state = broker.getState();
        finalEquity = state.totalEquity;
        
        const position = broker.getPosition('BTCUSDT');
        if (!position) break; // Liquidated
      }
      
      expect(finalEquity).toBeLessThan(10000); // Lost money
    });
  });

  describe('Funding Rate Impact on Monotonic Trends', () => {
    test('Long position with positive funding in uptrend', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyGain = 0.5; // 0.5% daily (slower trend to see funding impact)
      const days = 30;
      
      const candles = generateMonotonicCandles(startPrice, dailyGain, days);
      const baseTime = Date.now();
      
      // Open long position
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 10, 'CROSS');
      expect(result.success).toBe(true);
      
      // Set positive funding rate (longs pay)
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime); // 0.01% per 8 hours
      
      let totalFundingPaid = 0;
      let finalEquity = 0;
      
      // Simulate with funding every 8 hours
      for (let hour = 0; hour < days * 24; hour += 8) {
        const timeOffset = hour * 60 * 60 * 1000;
        const candleIndex = Math.floor(hour / 24);
        if (candleIndex >= candles.length) break;
        
        const currentCandle = candles[candleIndex];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        
        const fundingPayments = broker.updateMarkPrices(markPrices, baseTime + timeOffset);
        
        for (const payment of fundingPayments) {
          totalFundingPaid += Math.abs(payment.payment);
        }
        
        const state = broker.getState();
        finalEquity = state.totalEquity;
      }
      
      // Long position should pay funding (reducing profits)
      expect(totalFundingPaid).toBeGreaterThan(0);
      expect(finalEquity).toBeGreaterThan(10000); // Still profitable due to uptrend
      
      // But less profitable than without funding
      const position = broker.getPosition('BTCUSDT');
      expect(position?.accumulatedFunding).toBeLessThan(0); // Negative (paid funding)
    });

    test('Short position with positive funding in downtrend', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyLoss = -0.5; // 0.5% daily decline
      const days = 30;
      
      const candles = generateMonotonicCandles(startPrice, dailyLoss, days);
      const baseTime = Date.now();
      
      // Open short position
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'SELL', 1.0, context, 10, 'CROSS');
      expect(result.success).toBe(true);
      
      // Set positive funding rate (shorts receive)
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime);
      
      let totalFundingReceived = 0;
      let finalEquity = 0;
      
      for (let hour = 0; hour < days * 24; hour += 8) {
        const timeOffset = hour * 60 * 60 * 1000;
        const candleIndex = Math.floor(hour / 24);
        if (candleIndex >= candles.length) break;
        
        const currentCandle = candles[candleIndex];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        
        const fundingPayments = broker.updateMarkPrices(markPrices, baseTime + timeOffset);
        
        for (const payment of fundingPayments) {
          if (payment.payment > 0) {
            totalFundingReceived += payment.payment;
          }
        }
        
        const state = broker.getState();
        finalEquity = state.totalEquity;
      }
      
      // Short position should receive funding (increasing profits)
      expect(totalFundingReceived).toBeGreaterThan(0);
      expect(finalEquity).toBeGreaterThan(10000); // Profitable from downtrend + funding
      
      const position = broker.getPosition('BTCUSDT');
      expect(position?.accumulatedFunding).toBeGreaterThan(0); // Positive (received funding)
    });
  });

  describe('Reference Results Validation', () => {
    test('Deterministic uptrend results match expected values', () => {
      // This test serves as a "golden reference" that should not change
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyGain = 1; // Exactly 1%
      const days = 10; // Exactly 10 days
      
      const candles = generateMonotonicCandles(startPrice, dailyGain, days, 1640995200000); // Fixed start time
      const baseTime = 1640995200000;
      
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 10, 'CROSS');
      expect(result.success).toBe(true);
      
      // Process all days
      for (let day = 0; day < days; day++) {
        const currentCandle = candles[day];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        broker.updateMarkPrices(markPrices, baseTime + (day * 24 * 60 * 60 * 1000));
      }
      
      const finalState = broker.getState();
      const finalPrice = candles[days - 1].close;
      const position = broker.getPosition('BTCUSDT');
      
      // These values should be deterministic and repeatable
      const expectedFinalPrice = 50000 * Math.pow(1.01, 10); // Exactly (1.01)^10
      expect(finalPrice).toBeCloseTo(expectedFinalPrice, 6);
      expect(expectedFinalPrice).toBeCloseTo(55230.48, 2); // ~$55,230.48
      
      // Position should have predictable unrealized P&L
      const expectedUnrealizedPnl = (finalPrice - 50000) * 1.0; // 1 BTC position
      expect(position?.unrealizedPnl).toBeCloseTo(expectedUnrealizedPnl, 2);
      
      // Total equity should be initial + unrealized - fees
      const expectedCommission = 50000 * 1.0 * 0.0004; // Taker fee on entry
      expect(finalState.balance).toBeCloseTo(10000 - expectedCommission, 2);
      expect(finalState.totalEquity).toBeCloseTo(10000 - expectedCommission + expectedUnrealizedPnl, 2);
    });

    test('Deterministic downtrend results match expected values', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const dailyLoss = -1; // Exactly -1%
      const days = 10;
      
      const candles = generateMonotonicCandles(startPrice, dailyLoss, days, 1640995200000);
      const baseTime = 1640995200000;
      
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'SELL', 1.0, context, 10, 'CROSS'); // Short position
      expect(result.success).toBe(true);
      
      for (let day = 0; day < days; day++) {
        const currentCandle = candles[day];
        const markPrices = { 'BTCUSDT': currentCandle.close };
        broker.updateMarkPrices(markPrices, baseTime + (day * 24 * 60 * 60 * 1000));
      }
      
      const finalState = broker.getState();
      const finalPrice = candles[days - 1].close;
      const position = broker.getPosition('BTCUSDT');
      
      const expectedFinalPrice = 50000 * Math.pow(0.99, 10); // (0.99)^10
      expect(finalPrice).toBeCloseTo(expectedFinalPrice, 6);
      expect(expectedFinalPrice).toBeCloseTo(45440.35, 2); // ~$45,440.35
      
      // Short position profits when price declines
      const expectedUnrealizedPnl = (50000 - finalPrice) * 1.0; // Profit from price decline
      expect(position?.unrealizedPnl).toBeCloseTo(expectedUnrealizedPnl, 2);
      expect(expectedUnrealizedPnl).toBeGreaterThan(0); // Should be positive
    });
  });
});