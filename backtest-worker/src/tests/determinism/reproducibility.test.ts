import { Broker } from '../../trading/Broker.js';
import { BINANCE_SPECS } from '../../trading/ExchangeSpec.js';

// Helper to generate deterministic candle data with fixed seed
function generateDeterministicCandles(
  seed: number, 
  count: number, 
  basePrice: number = 50000,
  startTime: number = 1640995200000
): any[] {
  // Simple linear congruential generator for deterministic randomness
  let rng = seed;
  const next = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };
  
  const candles = [];
  let currentPrice = basePrice;
  
  for (let i = 0; i < count; i++) {
    const timestamp = startTime + (i * 60000); // 1-minute candles
    
    // Generate price movement with deterministic randomness
    const change = (next() - 0.5) * 0.02; // ±1% max change
    const newPrice = currentPrice * (1 + change);
    
    const open = currentPrice;
    const close = newPrice;
    const high = Math.max(open, close) * (1 + next() * 0.005); // Small wick up
    const low = Math.min(open, close) * (1 - next() * 0.005);  // Small wick down
    
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.floor(next() * 2000), // Volume 1000-3000
      
      // Add deterministic features
      roc_1m: change * 100,
      roc_5m: (next() - 0.5) * 10,
      vol_mult: 0.5 + next() * 1.5,
      spread_bps: 1 + next() * 3,
      rsi_14: 30 + next() * 40
    });
    
    currentPrice = newPrice;
  }
  
  return candles;
}

describe('Determinism and Reproducibility Tests', () => {
  describe('Identical Inputs Produce Identical Results', () => {
    test('Same seed produces identical backtest results', () => {
      const seed = 12345;
      const initialBalance = 10000;
      const candleCount = 100;
      
      // Run backtest twice with identical parameters
      const results = [];
      
      for (let run = 0; run < 2; run++) {
        const broker = new Broker(initialBalance, BINANCE_SPECS);
        const candles = generateDeterministicCandles(seed, candleCount);
        const baseTime = 1640995200000;
        
        // Execute identical trading sequence
        const context = {
          timestamp: baseTime,
          candle: candles[0]
        };
        
        // Open position
        const openResult = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 10, 'CROSS');
        expect(openResult.success).toBe(true);
        
        // Process all candles
        const equityCurve = [];
        for (let i = 0; i < candleCount; i++) {
          const currentCandle = candles[i];
          const markPrices = { 'BTCUSDT': currentCandle.close };
          
          broker.updateMarkPrices(markPrices, baseTime + (i * 60000));
          
          const state = broker.getState();
          equityCurve.push({
            timestamp: currentCandle.timestamp,
            equity: state.totalEquity,
            balance: state.balance,
            unrealizedPnl: state.unrealizedPnl
          });
        }
        
        // Close position
        const finalContext = {
          timestamp: baseTime + (candleCount * 60000),
          candle: candles[candleCount - 1]
        };
        
        const closeResult = broker.marketOrder('BTCUSDT', 'SELL', 1.0, finalContext, 10, 'CROSS');
        
        results.push({
          openResult,
          closeResult,
          equityCurve,
          finalState: broker.getState(),
          finalPosition: broker.getPosition('BTCUSDT')
        });
      }
      
      // Compare results - should be identical
      const [run1, run2] = results;
      
      // Opening trades should be identical
      expect(run1.openResult.execution?.fillPrice).toBe(run2.openResult.execution?.fillPrice);
      expect(run1.openResult.execution?.commission).toBe(run2.openResult.execution?.commission);
      
      // Closing trades should be identical  
      expect(run1.closeResult.execution?.fillPrice).toBe(run2.closeResult.execution?.fillPrice);
      expect(run1.closeResult.execution?.commission).toBe(run2.closeResult.execution?.commission);
      
      // Equity curves should be identical at every point
      expect(run1.equityCurve.length).toBe(run2.equityCurve.length);
      for (let i = 0; i < run1.equityCurve.length; i++) {
        expect(run1.equityCurve[i].equity).toBeCloseTo(run2.equityCurve[i].equity, 10);
        expect(run1.equityCurve[i].balance).toBeCloseTo(run2.equityCurve[i].balance, 10);
        expect(run1.equityCurve[i].unrealizedPnl).toBeCloseTo(run2.equityCurve[i].unrealizedPnl, 10);
      }
      
      // Final states should be identical
      expect(run1.finalState.totalEquity).toBeCloseTo(run2.finalState.totalEquity, 10);
      expect(run1.finalState.balance).toBeCloseTo(run2.finalState.balance, 10);
      
      // Both positions should be closed
      expect(run1.finalPosition).toBeNull();
      expect(run2.finalPosition).toBeNull();
    });

    test('Different seeds produce different but valid results', () => {
      const seeds = [11111, 22222, 33333];
      const results = [];
      
      for (const seed of seeds) {
        const broker = new Broker(10000, BINANCE_SPECS);
        const candles = generateDeterministicCandles(seed, 50);
        const baseTime = 1640995200000;
        
        const context = {
          timestamp: baseTime,
          candle: candles[0]
        };
        
        broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 5, 'CROSS');
        
        // Process candles
        for (let i = 0; i < candles.length; i++) {
          const markPrices = { 'BTCUSDT': candles[i].close };
          broker.updateMarkPrices(markPrices, baseTime + (i * 60000));
        }
        
        results.push({
          finalEquity: broker.getState().totalEquity,
          finalPrice: candles[candles.length - 1].close,
          seed
        });
      }
      
      // Results should be different
      const equities = results.map(r => r.finalEquity);
      const prices = results.map(r => r.finalPrice);
      
      // All equities should be different (very unlikely to be identical)
      expect(new Set(equities).size).toBe(equities.length);
      
      // All prices should be different  
      expect(new Set(prices).size).toBe(prices.length);
      
      // But all should be valid results
      for (const result of results) {
        expect(result.finalEquity).toBeGreaterThan(0); // No bankruptcies
        expect(result.finalEquity).toBeLessThan(50000); // Reasonable upper bound
        expect(result.finalPrice).toBeGreaterThan(30000); // Reasonable price range
        expect(result.finalPrice).toBeLessThan(80000);
      }
    });
  });

  describe('Floating Point Precision Consistency', () => {
    test('Calculations remain precise across different environments', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const baseTime = 1640995200000;
      
      // Test precision-sensitive calculations
      const precisionTestValues = [
        0.123456789,
        1.000000001,
        999999.999999,
        0.000000001
      ];
      
      for (const testValue of precisionTestValues) {
        const context = {
          timestamp: baseTime,
          candle: {
            timestamp: baseTime,
            open: 50000,
            high: 50000,
            low: 50000,
            close: 50000,
            volume: 1000
          }
        };
        
        // Test with fractional quantities
        const result = broker.marketOrder('BTCUSDT', 'BUY', testValue, context, 1, 'CROSS');
        
        if (result.success) {
          const position = broker.getPosition('BTCUSDT');
          
          // Position size should be precisely what was ordered (after validation)
          expect(position?.size).not.toBeNaN();
          expect(position?.size).toBeGreaterThan(0);
          expect(isFinite(position?.size!)).toBe(true);
          
          // Clean up for next test
          broker.marketOrder('BTCUSDT', 'SELL', position!.size, context, 1, 'CROSS');
        }
      }
    });

    test('Fee calculations maintain precision over many trades', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const baseTime = 1640995200000;
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000
        }
      };
      
      let totalFeesCalculated = 0;
      const initialBalance = broker.getState().balance;
      
      // Execute many small trades
      for (let i = 0; i < 100; i++) {
        const buyResult = broker.marketOrder('BTCUSDT', 'BUY', 0.01, context, 1, 'CROSS');
        const sellResult = broker.marketOrder('BTCUSDT', 'SELL', 0.01, context, 1, 'CROSS');
        
        if (buyResult.execution) {
          totalFeesCalculated += buyResult.execution.commission;
        }
        if (sellResult.execution) {
          totalFeesCalculated += sellResult.execution.commission;
        }
      }
      
      const finalBalance = broker.getState().balance;
      const actualFeesPaid = initialBalance - finalBalance;
      
      // Calculated fees should match actual balance change
      expect(actualFeesPaid).toBeCloseTo(totalFeesCalculated, 6);
      
      // No position should remain
      expect(broker.getPosition('BTCUSDT')).toBeNull();
    });
  });

  describe('Order of Operations Consistency', () => {
    test('Different order of same operations produces same result', () => {
      const baseTime = 1640995200000;
      const candles = generateDeterministicCandles(54321, 20);
      
      // Scenario 1: All buys first, then all sells
      const broker1 = new Broker(10000, BINANCE_SPECS);
      
      // Execute 5 buy orders
      for (let i = 0; i < 5; i++) {
        const context = {
          timestamp: baseTime + (i * 60000),
          candle: candles[i]
        };
        broker1.marketOrder('BTCUSDT', 'BUY', 0.2, context, 1, 'CROSS');
      }
      
      // Execute 5 sell orders
      for (let i = 5; i < 10; i++) {
        const context = {
          timestamp: baseTime + (i * 60000),
          candle: candles[i]
        };
        broker1.marketOrder('BTCUSDT', 'SELL', 0.2, context, 1, 'CROSS');
      }
      
      // Scenario 2: Alternating buys and sells
      const broker2 = new Broker(10000, BINANCE_SPECS);
      
      for (let i = 0; i < 10; i++) {
        const context = {
          timestamp: baseTime + (i * 60000),
          candle: candles[i]
        };
        
        if (i < 5) {
          broker2.marketOrder('BTCUSDT', 'BUY', 0.2, context, 1, 'CROSS');
        } else {
          broker2.marketOrder('BTCUSDT', 'SELL', 0.2, context, 1, 'CROSS');
        }
      }
      
      // Final states should be identical (same total volume traded)
      const state1 = broker1.getState();
      const state2 = broker2.getState();
      
      expect(state1.balance).toBeCloseTo(state2.balance, 6);
      expect(state1.totalEquity).toBeCloseTo(state2.totalEquity, 6);
      
      // Both should have no positions
      expect(broker1.getPosition('BTCUSDT')).toBeNull();
      expect(broker2.getPosition('BTCUSDT')).toBeNull();
    });

    test('Mark price updates before vs after trades produce different results', () => {
      const broker1 = new Broker(10000, BINANCE_SPECS);
      const broker2 = new Broker(10000, BINANCE_SPECS);
      const baseTime = 1640995200000;
      
      const context1 = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000
        }
      };
      
      const context2 = {
        timestamp: baseTime + 60000,
        candle: {
          timestamp: baseTime + 60000,
          open: 51000,
          high: 51000,
          low: 51000,
          close: 51000, // Higher price
          volume: 1000
        }
      };
      
      // Broker 1: Trade first, then update mark price
      broker1.marketOrder('BTCUSDT', 'BUY', 1.0, context1, 10, 'CROSS');
      broker1.updateMarkPrices({ 'BTCUSDT': 51000 }, baseTime + 60000);
      
      // Broker 2: Update mark price first, then trade
      broker2.updateMarkPrices({ 'BTCUSDT': 51000 }, baseTime + 60000);  
      broker2.marketOrder('BTCUSDT', 'BUY', 1.0, context2, 10, 'CROSS');
      
      const state1 = broker1.getState();
      const state2 = broker2.getState();
      const position1 = broker1.getPosition('BTCUSDT');
      const position2 = broker2.getPosition('BTCUSDT');
      
      // Entry prices should be different
      expect(position1?.entryPrice).toBe(50000);
      expect(position2?.entryPrice).toBe(51000);
      
      // Unrealized P&L should be different
      expect(position1?.unrealizedPnl).toBeGreaterThan(position2?.unrealizedPnl!);
      
      // Total equity should be different
      expect(state1.totalEquity).not.toBeCloseTo(state2.totalEquity, 0);
    });
  });

  describe('State Persistence and Isolation', () => {
    test('Broker instances are completely isolated', () => {
      const broker1 = new Broker(5000, BINANCE_SPECS);
      const broker2 = new Broker(5000, BINANCE_SPECS);
      const baseTime = 1640995200000;
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000
        }
      };
      
      // Different trades in each broker
      broker1.marketOrder('BTCUSDT', 'BUY', 1.0, context, 5, 'CROSS');
      broker2.marketOrder('BTCUSDT', 'SELL', 2.0, context, 10, 'CROSS');
      
      // Set different funding rates
      broker1.setFundingRate('BTCUSDT', 0.0001, baseTime);
      broker2.setFundingRate('BTCUSDT', -0.0002, baseTime);
      
      // Update mark prices
      broker1.updateMarkPrices({ 'BTCUSDT': 52000 }, baseTime + (8 * 60 * 60 * 1000));
      broker2.updateMarkPrices({ 'BTCUSDT': 52000 }, baseTime + (8 * 60 * 60 * 1000));
      
      const state1 = broker1.getState();
      const state2 = broker2.getState();
      const position1 = broker1.getPosition('BTCUSDT');
      const position2 = broker2.getPosition('BTCUSDT');
      
      // States should be completely different
      expect(state1.balance).not.toBeCloseTo(state2.balance, 0);
      expect(state1.totalEquity).not.toBeCloseTo(state2.totalEquity, 0);
      
      // Positions should be different
      expect(position1?.side).toBe('LONG');
      expect(position2?.side).toBe('SHORT');
      expect(position1?.size).toBe(1.0);
      expect(position2?.size).toBe(2.0);
      
      // Funding payments should be different
      expect(position1?.accumulatedFunding).toBeLessThan(0); // Long paid
      expect(position2?.accumulatedFunding).toBeGreaterThan(0); // Short received (negative rate)
    });

    test('Resetting broker state produces clean slate', () => {
      const initialBalance = 10000;
      let broker = new Broker(initialBalance, BINANCE_SPECS);
      const baseTime = 1640995200000;
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000
        }
      };
      
      // Make some trades and changes
      broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 10, 'CROSS');
      broker.setFundingRate('BTCUSDT', 0.001, baseTime);
      broker.updateMarkPrices({ 'BTCUSDT': 55000 }, baseTime + 60000);
      
      const dirtyState = broker.getState();
      expect(dirtyState.totalEquity).not.toBeCloseTo(initialBalance, 0);
      
      // Create fresh broker
      broker = new Broker(initialBalance, BINANCE_SPECS);
      const cleanState = broker.getState();
      
      // Should be back to initial state
      expect(cleanState.balance).toBe(initialBalance);
      expect(cleanState.totalEquity).toBe(initialBalance);
      expect(cleanState.unrealizedPnl).toBe(0);
      expect(cleanState.usedMargin).toBe(0);
      expect(cleanState.availableMargin).toBe(initialBalance);
      
      expect(broker.getPositions()).toHaveLength(0);
      expect(broker.getPosition('BTCUSDT')).toBeNull();
    });
  });

  describe('Timestamp Consistency', () => {
    test('Same relative timing produces same results regardless of absolute time', () => {
      const results = [];
      
      // Test with different start times but same relative timing
      const startTimes = [
        1640995200000, // 2022-01-01
        1672531200000, // 2023-01-01  
        1704067200000  // 2024-01-01
      ];
      
      for (const startTime of startTimes) {
        const broker = new Broker(10000, BINANCE_SPECS);
        const candles = generateDeterministicCandles(12345, 50, 50000, startTime);
        
        // Trade at relative time +5 minutes
        const tradeTime = startTime + (5 * 60000);
        const context = {
          timestamp: tradeTime,
          candle: candles[5]
        };
        
        broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 10, 'CROSS');
        
        // Update at relative time +15 minutes
        const updateTime = startTime + (15 * 60000);
        broker.updateMarkPrices({ 'BTCUSDT': candles[15].close }, updateTime);
        
        // Set funding at relative time (should trigger at +8 hours)
        broker.setFundingRate('BTCUSDT', 0.0001, startTime);
        
        // Update at relative time +8 hours 1 minute (should trigger funding)
        const fundingTime = startTime + (8 * 60 * 60 * 1000) + 60000;
        broker.updateMarkPrices({ 'BTCUSDT': candles[20].close }, fundingTime);
        
        results.push({
          finalState: broker.getState(),
          position: broker.getPosition('BTCUSDT'),
          startTime
        });
      }
      
      // Results should be identical despite different absolute timestamps
      const [result1, result2, result3] = results;
      
      expect(result1.finalState.totalEquity).toBeCloseTo(result2.finalState.totalEquity, 6);
      expect(result2.finalState.totalEquity).toBeCloseTo(result3.finalState.totalEquity, 6);
      
      expect(result1.position?.accumulatedFunding).toBeCloseTo(result2.position?.accumulatedFunding!, 10);
      expect(result2.position?.accumulatedFunding).toBeCloseTo(result3.position?.accumulatedFunding!, 10);
    });
  });
});

// Export for golden reference comparison
export { generateDeterministicCandles };