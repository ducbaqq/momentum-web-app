import { Executor } from '../../trading/Executor.js';
import { createMarketOrder } from '../../trading/Order.js';
import { BINANCE_SPECS } from '../../trading/ExchangeSpec.js';

describe('Fee Calculations', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor(BINANCE_SPECS);
  });

  describe('Market Order Fees', () => {
    test('BTC taker fee calculation (0.04%)', () => {
      const order = createMarketOrder('BTCUSDT', 'BUY', 1.0, Date.now());
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

      const execution = executor.executeOrder(order, context);

      expect(execution.status).toBe('FILLED');
      expect(execution.fillPrice).toBe(50000);
      expect(execution.fillQuantity).toBe(1.0);
      
      // Taker fee: 4 bps = 0.04% = 0.0004
      const expectedFee = 1.0 * 50000 * 0.0004; // $20
      expect(execution.commission).toBeCloseTo(expectedFee, 6);
      expect(execution.commission).toBeCloseTo(20, 2);
    });

    test('ETH taker fee calculation (0.04%)', () => {
      const order = createMarketOrder('ETHUSDT', 'SELL', 10.0, Date.now());
      const context = {
        timestamp: Date.now(),
        candle: {
          open: 3000,
          high: 3000,
          low: 3000,
          close: 3000,
          volume: 1000,
          timestamp: Date.now()
        }
      };

      const execution = executor.executeOrder(order, context);

      expect(execution.status).toBe('FILLED');
      expect(execution.fillPrice).toBe(3000);
      expect(execution.fillQuantity).toBe(10.0);
      
      // Taker fee: 4 bps = 0.04% = 0.0004
      const expectedFee = 10.0 * 3000 * 0.0004; // $12
      expect(execution.commission).toBeCloseTo(expectedFee, 6);
      expect(execution.commission).toBeCloseTo(12, 2);
    });

    test('Zero quantity order has zero fees', () => {
      const order = createMarketOrder('BTCUSDT', 'BUY', 0.0, Date.now());
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

      const execution = executor.executeOrder(order, context);
      expect(execution.commission).toBe(0);
    });

    test('Small position fee precision', () => {
      const order = createMarketOrder('BTCUSDT', 'BUY', 0.001, Date.now()); // 0.001 BTC
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

      const execution = executor.executeOrder(order, context);

      // Notional: 0.001 * 50000 = $50
      // Fee: $50 * 0.0004 = $0.02
      const expectedFee = 0.001 * 50000 * 0.0004;
      expect(execution.commission).toBeCloseTo(expectedFee, 8);
      expect(execution.commission).toBeCloseTo(0.02, 4);
    });

    test('Large position fee calculation', () => {
      const order = createMarketOrder('BTCUSDT', 'BUY', 100.0, Date.now()); // 100 BTC
      const context = {
        timestamp: Date.now(),
        candle: {
          open: 60000,
          high: 60000,
          low: 60000,
          close: 60000,
          volume: 10000,
          timestamp: Date.now()
        }
      };

      const execution = executor.executeOrder(order, context);

      // Notional: 100 * 60000 = $6,000,000
      // Fee: $6,000,000 * 0.0004 = $2,400
      const expectedFee = 100.0 * 60000 * 0.0004;
      expect(execution.commission).toBeCloseTo(expectedFee, 2);
      expect(execution.commission).toBeCloseTo(2400, 2);
    });
  });

  describe('Fee BPS (Basis Points) Conversion', () => {
    test('Verify BPS to decimal conversion', () => {
      // 1 bps = 0.01% = 0.0001
      // 4 bps = 0.04% = 0.0004
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      
      expect(btcSpec.takerFeeBps).toBe(4); // 4 basis points
      expect(btcSpec.makerFeeBps).toBe(2); // 2 basis points
      
      // In fee calculation: feeBps / 10000
      const takerFeeRate = btcSpec.takerFeeBps / 10000; // 0.0004
      const makerFeeRate = btcSpec.makerFeeBps / 10000; // 0.0002
      
      expect(takerFeeRate).toBe(0.0004);
      expect(makerFeeRate).toBe(0.0002);
    });

    test('Fee percentage calculations are correct', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      const ethSpec = BINANCE_SPECS['ETHUSDT'];
      
      // Both should have same fee structure
      expect(btcSpec.takerFeeBps).toBe(4); // 0.04%
      expect(btcSpec.makerFeeBps).toBe(2); // 0.02%
      expect(ethSpec.takerFeeBps).toBe(4); // 0.04%  
      expect(ethSpec.makerFeeBps).toBe(2); // 0.02%
    });
  });

  describe('Fee Rounding Edge Cases', () => {
    test('Very small fee amounts round correctly', () => {
      const order = createMarketOrder('BTCUSDT', 'BUY', 0.00001, Date.now()); // Tiny position
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

      const execution = executor.executeOrder(order, context);

      // Notional: 0.00001 * 50000 = $0.5
      // Fee: $0.5 * 0.0004 = $0.0002
      const expectedFee = 0.00001 * 50000 * 0.0004;
      expect(execution.commission).toBeCloseTo(expectedFee, 10);
      expect(execution.commission).not.toBeNaN();
      expect(execution.commission).toBeGreaterThanOrEqual(0);
    });

    test('Fee calculation maintains precision', () => {
      // Test that fees don't accumulate floating point errors
      let totalFees = 0;
      
      for (let i = 0; i < 100; i++) {
        const order = createMarketOrder('BTCUSDT', 'BUY', 0.01, Date.now());
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

        const execution = executor.executeOrder(order, context);
        totalFees += execution.commission;
      }

      // Expected: 100 * (0.01 * 50000 * 0.0004) = 100 * 0.2 = $20
      const expectedTotalFees = 100 * 0.01 * 50000 * 0.0004;
      expect(totalFees).toBeCloseTo(expectedTotalFees, 6);
    });
  });
});