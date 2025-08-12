import { Broker } from '../../trading/Broker.js';
import { BINANCE_SPECS } from '../../trading/ExchangeSpec.js';
import { calculateLiquidationPrice } from '../../trading/Position.js';

// Helper to generate flash crash candles
function generateFlashCrash(
  startPrice: number,
  crashPercent: number, // Negative for crash
  recoveryPercent: number,
  startTime: number = Date.now()
): any[] {
  const candles = [];
  const baseTime = startTime;
  
  // Pre-crash candle (stable)
  candles.push({
    timestamp: baseTime,
    open: startPrice,
    high: startPrice * 1.001,
    low: startPrice * 0.999,
    close: startPrice,
    volume: 1000
  });
  
  // Flash crash candle
  const crashPrice = startPrice * (1 + crashPercent / 100);
  candles.push({
    timestamp: baseTime + 60000, // 1 minute later
    open: startPrice,
    high: startPrice,
    low: crashPrice, // Extreme low
    close: crashPrice,
    volume: 5000 // High volume
  });
  
  // Recovery candle
  const recoveryPrice = crashPrice * (1 + recoveryPercent / 100);
  candles.push({
    timestamp: baseTime + 120000, // 2 minutes later
    open: crashPrice,
    high: recoveryPrice,
    low: crashPrice,
    close: recoveryPrice,
    volume: 3000
  });
  
  return candles;
}

describe('Golden Tests - Liquidation Scenarios', () => {
  describe('Flash Crash Liquidations', () => {
    test('100x long liquidated in 10% flash crash', () => {
      const broker = new Broker(1000, BINANCE_SPECS); // Smaller balance for quicker liquidation
      const startPrice = 50000;
      
      // Generate flash crash: -10% crash, +5% recovery
      const candles = generateFlashCrash(startPrice, -10, 5);
      const baseTime = Date.now();
      
      // Open extreme leverage long position
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 0.5, context, 100, 'CROSS'); // 100x leverage
      expect(result.success).toBe(true);
      
      const initialPosition = broker.getPosition('BTCUSDT');
      expect(initialPosition).not.toBeNull();
      expect(initialPosition?.leverage).toBe(100);
      
      // Calculate theoretical liquidation price
      const theoreticalLiqPrice = calculateLiquidationPrice(
        initialPosition!,
        broker.getState().availableMargin,
        0.004 // BTC maintenance margin rate
      );
      
      // Flash crash to $45,000 (10% drop)
      const crashContext = {
        timestamp: baseTime + 60000,
        candle: candles[1]
      };
      
      // Update mark prices to crash level
      const markPrices = { 'BTCUSDT': 45000 };
      broker.updateMarkPrices(markPrices, crashContext.timestamp);
      
      // Position should be liquidated
      const positionAfterCrash = broker.getPosition('BTCUSDT');
      expect(positionAfterCrash).toBeNull(); // Position should be gone (liquidated)
      
      // Account should have minimal balance left
      const finalState = broker.getState();
      expect(finalState.totalEquity).toBeLessThan(1000); // Lost significant amount
      expect(finalState.totalEquity).toBeGreaterThan(0);  // But not completely wiped out
      
      // Verify theoretical liquidation price was reasonable
      expect(theoreticalLiqPrice).toBeGreaterThan(45000); // Liquidation price above crash price
      expect(theoreticalLiqPrice).toBeLessThan(50000);    // But below entry price
    });

    test('50x short liquidated in 10% pump', () => {
      const broker = new Broker(2000, BINANCE_SPECS);
      const startPrice = 50000;
      
      // Generate pump: +10% spike, -3% retrace
      const candles = generateFlashCrash(startPrice, 10, -3);
      const baseTime = Date.now();
      
      // Open high leverage short position
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'SELL', 0.8, context, 50, 'CROSS');
      expect(result.success).toBe(true);
      
      const initialPosition = broker.getPosition('BTCUSDT');
      expect(initialPosition?.side).toBe('SHORT');
      expect(initialPosition?.leverage).toBe(50);
      
      // Pump to $55,000 (10% up)
      const pumpContext = {
        timestamp: baseTime + 60000,
        candle: candles[1]
      };
      
      const markPrices = { 'BTCUSDT': 55000 };
      broker.updateMarkPrices(markPrices, pumpContext.timestamp);
      
      // Short position should be liquidated in pump
      const positionAfterPump = broker.getPosition('BTCUSDT');
      expect(positionAfterPump).toBeNull();
      
      const finalState = broker.getState();
      expect(finalState.totalEquity).toBeLessThan(2000);
      expect(finalState.totalEquity).toBeGreaterThan(0);
    });

    test('Lower leverage position survives flash crash', () => {
      const broker = new Broker(5000, BINANCE_SPECS);
      const startPrice = 50000;
      
      const candles = generateFlashCrash(startPrice, -15, 8); // Even bigger crash
      const baseTime = Date.now();
      
      // Open moderate leverage position
      const context = {
        timestamp: baseTime,
        candle: candles[0]
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 5, 'CROSS'); // Only 5x leverage
      expect(result.success).toBe(true);
      
      // Survive the crash
      const crashPrice = 42500; // 15% crash
      const markPrices = { 'BTCUSDT': crashPrice };
      broker.updateMarkPrices(markPrices, baseTime + 60000);
      
      // Position should survive
      const positionAfterCrash = broker.getPosition('BTCUSDT');
      expect(positionAfterCrash).not.toBeNull();
      expect(positionAfterCrash?.unrealizedPnl).toBeLessThan(0); // Losing money
      
      // Should recover somewhat
      const recoveryPrice = 45900; // 8% recovery from crash low
      const recoveryMarkPrices = { 'BTCUSDT': recoveryPrice };
      broker.updateMarkPrices(recoveryMarkPrices, baseTime + 120000);
      
      const positionAfterRecovery = broker.getPosition('BTCUSDT');
      expect(positionAfterRecovery).not.toBeNull();
      expect(positionAfterRecovery?.unrealizedPnl).toBeGreaterThan(positionAfterCrash?.unrealizedPnl!); // Less loss
    });
  });

  describe('Gradual Liquidation Scenarios', () => {
    test('Slow bleed liquidation over multiple days', () => {
      const broker = new Broker(3000, BINANCE_SPECS);
      const startPrice = 50000;
      const baseTime = Date.now();
      
      // Open leveraged long position
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: startPrice,
          high: startPrice,
          low: startPrice,
          close: startPrice,
          volume: 1000
        }
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 20, 'CROSS'); // 20x leverage
      expect(result.success).toBe(true);
      
      const initialPosition = broker.getPosition('BTCUSDT');
      const theoreticalLiqPrice = calculateLiquidationPrice(
        initialPosition!,
        broker.getState().availableMargin,
        0.004
      );
      
      // Gradual decline over several days
      const dailyDeclines = [-2, -3, -2.5, -3.5, -2]; // Percent declines
      let currentPrice = startPrice;
      let daysPassed = 0;
      
      for (const decline of dailyDeclines) {
        daysPassed++;
        currentPrice *= (1 + decline / 100);
        
        const markPrices = { 'BTCUSDT': currentPrice };
        broker.updateMarkPrices(markPrices, baseTime + (daysPassed * 24 * 60 * 60 * 1000));
        
        const position = broker.getPosition('BTCUSDT');
        if (!position) {
          // Position was liquidated
          expect(currentPrice).toBeLessThanOrEqual(theoreticalLiqPrice * 1.05); // Within 5% of theoretical
          break;
        }
      }
      
      // Should be liquidated before reaching very low prices
      expect(daysPassed).toBeLessThan(dailyDeclines.length); // Liquidated before end
    });

    test('Position survives with stop-loss equivalent behavior', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: startPrice,
          high: startPrice,
          low: startPrice,
          close: startPrice,
          volume: 1000
        }
      };
      
      // Open position with conservative leverage
      const result = broker.marketOrder('BTCUSDT', 'BUY', 2.0, context, 3, 'CROSS'); // 3x leverage
      expect(result.success).toBe(true);
      
      // Simulate manual "stop loss" at 5% decline
      const stopLossPrice = startPrice * 0.95; // 5% stop loss
      
      // Price declines to stop loss level
      const stopLossContext = {
        timestamp: baseTime + 60000,
        candle: {
          timestamp: baseTime + 60000,
          open: startPrice,
          high: startPrice,
          low: stopLossPrice,
          close: stopLossPrice,
          volume: 2000
        }
      };
      
      // Close position manually (simulating stop loss)
      const closeResult = broker.marketOrder('BTCUSDT', 'SELL', 2.0, stopLossContext, 3, 'CROSS');
      expect(closeResult.success).toBe(true);
      
      // Position should be closed
      const finalPosition = broker.getPosition('BTCUSDT');
      expect(finalPosition).toBeNull();
      
      // Should have controlled loss
      const finalState = broker.getState();
      const expectedLoss = 2.0 * (startPrice - stopLossPrice); // 2 BTC * $2500 loss = $5000
      const expectedEquity = 10000 - expectedLoss - (2 * 50000 * 0.0004) - (2 * stopLossPrice * 0.0004); // Minus fees
      
      expect(finalState.totalEquity).toBeLessThan(10000);
      expect(finalState.totalEquity).toBeCloseTo(expectedEquity, -2);
      expect(finalState.totalEquity).toBeGreaterThan(4000); // Controlled loss, not wiped out
    });
  });

  describe('Cross vs Isolated Margin Liquidations', () => {
    test('Cross margin liquidation considers full account balance', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      const startPrice = 50000;
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: startPrice,
          high: startPrice,
          low: startPrice,
          close: startPrice,
          volume: 1000
        }
      };
      
      // Open large cross margin position
      const result = broker.marketOrder('BTCUSDT', 'BUY', 5.0, context, 20, 'CROSS');
      expect(result.success).toBe(true);
      
      // Large price decline
      const crashPrice = startPrice * 0.85; // 15% crash
      const markPrices = { 'BTCUSDT': crashPrice };
      broker.updateMarkPrices(markPrices, baseTime + 60000);
      
      // Check if position survived using full account balance
      const position = broker.getPosition('BTCUSDT');
      const state = broker.getState();
      
      if (position) {
        // Position survived because it can use full account balance
        expect(state.totalEquity).toBeGreaterThan(0);
        expect(position.unrealizedPnl).toBeLessThan(-5000); // Significant loss
      } else {
        // Position was liquidated, but account isn't completely wiped
        expect(state.totalEquity).toBeGreaterThan(0);
      }
    });

    test('Multiple positions liquidation cascade', () => {
      const broker = new Broker(20000, BINANCE_SPECS);
      const startPrice = 50000;
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: startPrice,
          high: startPrice,
          low: startPrice,
          close: startPrice,
          volume: 1000
        }
      };
      
      // Open multiple leveraged positions (simulating different symbols)
      const result1 = broker.marketOrder('BTCUSDT', 'BUY', 2.0, context, 15, 'CROSS');
      expect(result1.success).toBe(true);
      
      // Second position would be different symbol, but using same for testing
      const result2 = broker.marketOrder('ETHUSDT', 'BUY', 10.0, {
        ...context,
        candle: { ...context.candle, close: 3000, open: 3000, high: 3000, low: 3000 }
      }, 15, 'CROSS');
      expect(result2.success).toBe(true);
      
      // Crash both markets simultaneously
      const crashTime = baseTime + 60000;
      const btcCrashPrice = startPrice * 0.8; // 20% crash
      const ethCrashPrice = 3000 * 0.8;       // 20% crash
      
      const markPrices = { 
        'BTCUSDT': btcCrashPrice,
        'ETHUSDT': ethCrashPrice
      };
      broker.updateMarkPrices(markPrices, crashTime);
      
      // Check which positions survived
      const btcPosition = broker.getPosition('BTCUSDT');
      const ethPosition = broker.getPosition('ETHUSDT');
      const finalState = broker.getState();
      
      // At least one position should be liquidated due to high leverage
      const positionsRemaining = [btcPosition, ethPosition].filter(p => p !== null).length;
      expect(positionsRemaining).toBeLessThan(2);
      
      // Account should still have some equity (not completely wiped)
      expect(finalState.totalEquity).toBeGreaterThan(0);
    });
  });

  describe('Liquidation Price Accuracy', () => {
    test('Actual liquidation occurs at calculated liquidation price', () => {
      const broker = new Broker(5000, BINANCE_SPECS);
      const startPrice = 50000;
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: startPrice,
          high: startPrice,
          low: startPrice,
          close: startPrice,
          volume: 1000
        }
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 2.0, context, 25, 'CROSS');
      expect(result.success).toBe(true);
      
      const position = broker.getPosition('BTCUSDT');
      const theoreticalLiqPrice = calculateLiquidationPrice(
        position!,
        broker.getState().availableMargin,
        0.004
      );
      
      // Test price just above liquidation price
      const justAboveLiqPrice = theoreticalLiqPrice * 1.001;
      let markPrices = { 'BTCUSDT': justAboveLiqPrice };
      broker.updateMarkPrices(markPrices, baseTime + 30000);
      
      let positionAfterTest = broker.getPosition('BTCUSDT');
      expect(positionAfterTest).not.toBeNull(); // Should survive
      
      // Test price at liquidation price
      markPrices = { 'BTCUSDT': theoreticalLiqPrice * 0.999 };
      broker.updateMarkPrices(markPrices, baseTime + 60000);
      
      positionAfterTest = broker.getPosition('BTCUSDT');
      expect(positionAfterTest).toBeNull(); // Should be liquidated
      
      // Verify liquidation happened close to theoretical price
      const finalState = broker.getState();
      expect(finalState.totalEquity).toBeLessThan(5000);
      expect(finalState.totalEquity).toBeGreaterThan(0);
    });

    test('Liquidation with accumulated funding affects liquidation price', () => {
      const broker = new Broker(8000, BINANCE_SPECS);
      const startPrice = 50000;
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          timestamp: baseTime,
          open: startPrice,
          high: startPrice,
          low: startPrice,
          close: startPrice,
          volume: 1000
        }
      };
      
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.5, context, 20, 'CROSS');
      expect(result.success).toBe(true);
      
      // Set high funding rate that hurts long positions
      broker.setFundingRate('BTCUSDT', 0.001, baseTime); // 0.1% funding rate
      
      // Let several funding periods pass with sideways price
      for (let i = 1; i <= 5; i++) {
        const fundingTime = baseTime + (i * 8 * 60 * 60 * 1000); // Every 8 hours
        const markPrices = { 'BTCUSDT': startPrice * (0.995 + Math.random() * 0.01) }; // Slight variations
        
        broker.updateMarkPrices(markPrices, fundingTime);
      }
      
      const positionAfterFunding = broker.getPosition('BTCUSDT');
      expect(positionAfterFunding?.accumulatedFunding).toBeLessThan(0); // Paid funding
      
      // Now test liquidation - should happen at higher price due to funding costs
      const theoreticalLiqPrice = calculateLiquidationPrice(
        positionAfterFunding!,
        broker.getState().availableMargin,
        0.004
      );
      
      // Should be liquidated easier due to accumulated funding costs
      expect(theoreticalLiqPrice).toBeGreaterThan(45000); // Higher liquidation price
      
      const testLiqPrice = theoreticalLiqPrice * 0.999;
      const markPrices = { 'BTCUSDT': testLiqPrice };
      broker.updateMarkPrices(markPrices, baseTime + (6 * 8 * 60 * 60 * 1000));
      
      const finalPosition = broker.getPosition('BTCUSDT');
      expect(finalPosition).toBeNull(); // Should be liquidated
    });
  });
});