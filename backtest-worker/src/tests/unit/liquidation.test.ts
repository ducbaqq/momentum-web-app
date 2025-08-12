import { calculateLiquidationPrice, createPosition, isLiquidatable } from '../../trading/Position.js';
import { Broker } from '../../trading/Broker.js';
import { BINANCE_SPECS } from '../../trading/ExchangeSpec.js';

describe('Liquidation Price Mathematics', () => {
  describe('Liquidation Price Calculation Formula', () => {
    test('Long position liquidation price formula', () => {
      // Long liquidation formula:
      // liquidationPrice = (availableBalance + realizedPnl + initialMargin) / (size * (1 - maintenanceMarginRate))
      
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        1.0,      // 1 BTC
        50000,    // Entry at $50,000
        50000,    // Current mark price $50,000
        10,       // 10x leverage
        'CROSS',
        Date.now()
      );

      const availableBalance = 5000;
      const maintenanceMarginRate = 0.005; // 0.5%
      
      const liquidationPrice = calculateLiquidationPrice(
        position,
        availableBalance,
        maintenanceMarginRate
      );

      // Initial margin = notional / leverage = (1 * 50000) / 10 = $5,000
      // Expected liquidation price = (5000 + 0 + 5000) / (1 * (1 - 0.005))
      // = 10000 / (1 * 0.995) = 10000 / 0.995 ≈ $10,050.25
      const expected = (availableBalance + 0 + 5000) / (1.0 * (1 - maintenanceMarginRate));
      
      expect(liquidationPrice).toBeCloseTo(expected, 2);
      expect(liquidationPrice).toBeCloseTo(10050.25, 2);
    });

    test('Short position liquidation price formula', () => {
      // Short liquidation formula:
      // liquidationPrice = (availableBalance + realizedPnl + initialMargin) / (size * (1 + maintenanceMarginRate))
      
      const position = createPosition(
        'BTCUSDT',
        'SHORT',
        1.0,      // 1 BTC short
        50000,    // Entry at $50,000
        50000,    // Current mark price $50,000
        10,       // 10x leverage
        'CROSS',
        Date.now()
      );

      const availableBalance = 5000;
      const maintenanceMarginRate = 0.005; // 0.5%
      
      const liquidationPrice = calculateLiquidationPrice(
        position,
        availableBalance,
        maintenanceMarginRate
      );

      // Initial margin = $5,000
      // Expected liquidation price = (5000 + 0 + 5000) / (1 * (1 + 0.005))
      // = 10000 / (1 * 1.005) = 10000 / 1.005 ≈ $9,950.25
      const expected = (availableBalance + 0 + 5000) / (1.0 * (1 + maintenanceMarginRate));
      
      expect(liquidationPrice).toBeCloseTo(expected, 2);
      expect(liquidationPrice).toBeCloseTo(9950.25, 2);
    });

    test('Higher leverage reduces liquidation distance', () => {
      const availableBalance = 1000;
      const maintenanceMarginRate = 0.01; // 1%
      
      // Test different leverage levels
      const leverageLevels = [1, 5, 10, 50, 100];
      const liquidationPrices: number[] = [];
      
      for (const leverage of leverageLevels) {
        const position = createPosition(
          'BTCUSDT',
          'LONG',
          1.0,
          50000,
          50000,
          leverage,
          'CROSS',
          Date.now()
        );

        const liquidationPrice = calculateLiquidationPrice(
          position,
          availableBalance,
          maintenanceMarginRate
        );
        
        liquidationPrices.push(liquidationPrice);
      }
      
      // Higher leverage should result in higher liquidation prices (closer to entry price)
      for (let i = 1; i < liquidationPrices.length; i++) {
        expect(liquidationPrices[i]).toBeGreaterThan(liquidationPrices[i - 1]);
      }
      
      // 100x leverage liquidation should be very close to entry price
      const highLevLiqPrice = liquidationPrices[liquidationPrices.length - 1];
      expect(highLevLiqPrice).toBeGreaterThan(49000); // Very close to $50,000 entry
    });

    test('Different position sizes maintain same liquidation price ratio', () => {
      const availableBalance = 5000;
      const maintenanceMarginRate = 0.005;
      
      const sizes = [0.1, 1.0, 10.0];
      const liquidationPrices: number[] = [];
      
      for (const size of sizes) {
        const position = createPosition(
          'BTCUSDT',
          'LONG',
          size,
          50000,
          50000,
          10,
          'CROSS',
          Date.now()
        );

        const liquidationPrice = calculateLiquidationPrice(
          position,
          availableBalance,
          maintenanceMarginRate
        );
        
        liquidationPrices.push(liquidationPrice);
      }
      
      // All should have same liquidation price when using same leverage and margin rate
      // (assuming availableBalance scales appropriately)
      expect(liquidationPrices[0]).toBeCloseTo(liquidationPrices[1], 2);
      expect(liquidationPrices[1]).toBeCloseTo(liquidationPrices[2], 2);
    });
  });

  describe('Liquidation Detection', () => {
    test('Position is liquidatable when available margin < maintenance margin', () => {
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        1.0,
        50000,
        45000, // Mark price dropped to $45,000
        10,
        'CROSS',
        Date.now()
      );

      // Set maintenance margin higher than available margin
      position.maintenanceMargin = 6000; // $6,000 required
      const availableMargin = 4000; // Only $4,000 available
      
      expect(isLiquidatable(position, availableMargin)).toBe(true);
    });

    test('Position is not liquidatable when available margin >= maintenance margin', () => {
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        1.0,
        50000,
        48000, // Mark price dropped slightly to $48,000
        10,
        'CROSS',
        Date.now()
      );

      position.maintenanceMargin = 3000; // $3,000 required
      const availableMargin = 4000; // $4,000 available
      
      expect(isLiquidatable(position, availableMargin)).toBe(false);
    });

    test('Edge case - exactly at liquidation threshold', () => {
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        1.0,
        50000,
        46000,
        10,
        'CROSS',
        Date.now()
      );

      position.maintenanceMargin = 5000; // Exactly $5,000 required
      const availableMargin = 5000; // Exactly $5,000 available
      
      expect(isLiquidatable(position, availableMargin)).toBe(false); // >= threshold
    });
  });

  describe('Cross Margin vs Isolated Margin Liquidation', () => {
    test('Cross margin liquidation considers total account balance', () => {
      const broker = new Broker(10000, BINANCE_SPECS);
      
      const context = {
        timestamp: Date.now(),
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: Date.now()
        }
      };

      // Open large leveraged position
      const result = broker.marketOrder('BTCUSDT', 'BUY', 10.0, context, 50, 'CROSS');
      expect(result.success).toBe(true);
      
      // Check initial state
      const initialState = broker.getState();
      expect(initialState.totalEquity).toBeCloseTo(10000, -2); // ~$10,000 initial
      expect(initialState.usedMargin).toBeGreaterThan(0); // Some margin used
      
      // Simulate adverse price movement
      const adverseContext = {
        timestamp: Date.now(),
        candle: {
          open: 49000,
          high: 49000,
          low: 49000,
          close: 49000, // Price dropped $1,000
          volume: 1000,
          timestamp: Date.now()
        }
      };

      // Update mark prices to trigger liquidation check
      const markPrices = { 'BTCUSDT': 49000 };
      broker.updateMarkPrices(markPrices, Date.now());
      
      // Position should still exist if not liquidated
      const position = broker.getPosition('BTCUSDT');
      if (position) {
        expect(position.markPrice).toBe(49000);
        expect(position.unrealizedPnl).toBeLessThan(0); // Losing money
      }
    });
  });

  describe('Real-world Liquidation Scenarios', () => {
    test('Bitcoin flash crash liquidation scenario', () => {
      // Simulate a 10% flash crash on 100x leverage
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        10.0,     // 10 BTC
        50000,    // Entry at $50,000
        45000,    // Flash crash to $45,000 (10% down)
        100,      // 100x leverage
        'CROSS',
        Date.now()
      );

      const availableBalance = 5000;
      const maintenanceMarginRate = 0.004; // 0.4% (typical for high leverage)
      
      const liquidationPrice = calculateLiquidationPrice(
        position,
        availableBalance,
        maintenanceMarginRate
      );

      // With 100x leverage, a 1% move should be close to liquidation
      // Liquidation price should be very close to entry price
      expect(liquidationPrice).toBeGreaterThan(49500); // Very close to $50,000
      
      // At $45,000, position should be liquidated
      position.maintenanceMargin = 10 * 45000 * maintenanceMarginRate; // ~$180
      const currentAvailableMargin = availableBalance + position.unrealizedPnl;
      
      // This position would definitely be liquidated
      expect(isLiquidatable(position, Math.max(0, currentAvailableMargin))).toBe(true);
    });

    test('Gradual price decline leading to liquidation', () => {
      // Test gradual price decline that eventually triggers liquidation
      const broker = new Broker(10000, BINANCE_SPECS);
      
      const baseTime = Date.now();
      let currentPrice = 50000;
      
      // Open leveraged long position
      const context = {
        timestamp: baseTime,
        candle: {
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice,
          volume: 1000,
          timestamp: baseTime
        }
      };

      const result = broker.marketOrder('BTCUSDT', 'BUY', 5.0, context, 20, 'CROSS');
      expect(result.success).toBe(true);
      
      // Simulate gradual price decline
      const priceDrops = [49500, 49000, 48500, 48000, 47500, 47000];
      let liquidated = false;
      
      for (let i = 0; i < priceDrops.length; i++) {
        currentPrice = priceDrops[i];
        const markPrices = { 'BTCUSDT': currentPrice };
        
        broker.updateMarkPrices(markPrices, baseTime + (i + 1) * 60000);
        
        const position = broker.getPosition('BTCUSDT');
        if (!position) {
          liquidated = true;
          break;
        }
      }
      
      // Position should be liquidated before reaching the final price
      expect(liquidated).toBe(true);
    });

    test('Liquidation price changes with realized PnL', () => {
      // Test that liquidation price adjusts as position accumulates realized PnL
      const baseBalance = 5000;
      const realizedPnlValues = [-1000, 0, 1000, 2000]; // Different P&L scenarios
      
      for (const realizedPnl of realizedPnlValues) {
        const position = createPosition(
          'BTCUSDT',
          'LONG',
          1.0,
          50000,
          50000,
          10,
          'CROSS',
          Date.now()
        );
        
        position.realizedPnl = realizedPnl;
        
        const liquidationPrice = calculateLiquidationPrice(
          position,
          baseBalance,
          0.005
        );
        
        // Higher realized PnL should result in lower liquidation price (more buffer)
        if (realizedPnl > 0) {
          expect(liquidationPrice).toBeLessThan(10050); // Better than break-even case
        } else if (realizedPnl < 0) {
          expect(liquidationPrice).toBeGreaterThan(10050); // Worse than break-even case
        }
      }
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('Zero position size edge case', () => {
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        0, // Zero size
        50000,
        50000,
        10,
        'CROSS',
        Date.now()
      );

      const liquidationPrice = calculateLiquidationPrice(position, 5000, 0.005);
      
      // Should handle division by zero gracefully
      expect(liquidationPrice).not.toBeNaN();
      expect(isFinite(liquidationPrice)).toBe(true);
    });

    test('Very high maintenance margin rate', () => {
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        1.0,
        50000,
        50000,
        10,
        'CROSS',
        Date.now()
      );

      // Extreme maintenance margin rate (50%)
      const liquidationPrice = calculateLiquidationPrice(position, 5000, 0.5);
      
      expect(liquidationPrice).toBeGreaterThan(0);
      expect(isFinite(liquidationPrice)).toBe(true);
    });

    test('Negative available balance scenario', () => {
      const position = createPosition(
        'BTCUSDT',
        'LONG',
        1.0,
        50000,
        45000, // Significant loss
        10,
        'CROSS',
        Date.now()
      );

      // Negative available balance (account in deficit)
      const negativeBalance = -2000;
      position.maintenanceMargin = 1000;
      
      // Position should be immediately liquidatable
      expect(isLiquidatable(position, negativeBalance)).toBe(true);
    });
  });
});