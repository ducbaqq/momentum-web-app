import { Broker } from '../../trading/Broker.js';
import { BINANCE_SPECS } from '../../trading/ExchangeSpec.js';
import { createPosition } from '../../trading/Position.js';

describe('Funding Rate Accrual', () => {
  let broker: Broker;

  beforeEach(() => {
    broker = new Broker(10000, BINANCE_SPECS);
    broker.setPositionMode('ONE_WAY');
  });

  describe('Basic Funding Payments', () => {
    test('Long position pays funding when rate is positive', () => {
      const baseTime = Date.now();
      
      // Create a long position
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      // Open 1 BTC long position
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      // Set funding rate to 0.01% (0.0001)
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime);

      // Advance time by 8 hours (funding interval)
      const eightHoursLater = baseTime + (8 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 50000 };
      
      const fundingPayments = broker.updateMarkPrices(markPrices, eightHoursLater);
      
      expect(fundingPayments).toHaveLength(1);
      expect(fundingPayments[0].symbol).toBe('BTCUSDT');
      expect(fundingPayments[0].rate).toBe(0.0001);
      
      // Long pays funding: notional * rate * -1
      // Notional = 1 BTC * $50,000 = $50,000
      // Payment = $50,000 * 0.0001 * -1 = -$5 (pays $5)
      expect(fundingPayments[0].payment).toBe(-5);
      
      // Check that balance was debited
      const stateBefore = broker.getState();
      expect(stateBefore.balance).toBeLessThan(10000);
    });

    test('Short position receives funding when rate is positive', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      // Open 1 BTC short position
      const result = broker.marketOrder('BTCUSDT', 'SELL', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      // Set funding rate to 0.01% (0.0001)
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime);

      // Advance time by 8 hours
      const eightHoursLater = baseTime + (8 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 50000 };
      
      const fundingPayments = broker.updateMarkPrices(markPrices, eightHoursLater);
      
      expect(fundingPayments).toHaveLength(1);
      
      // Short receives funding: notional * rate * 1
      // Payment = $50,000 * 0.0001 * 1 = +$5 (receives $5)
      expect(fundingPayments[0].payment).toBe(5);
    });

    test('Negative funding rate - longs receive, shorts pay', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      // Open 1 BTC long position
      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      // Set negative funding rate -0.01% (-0.0001)
      broker.setFundingRate('BTCUSDT', -0.0001, baseTime);

      // Advance time by 8 hours
      const eightHoursLater = baseTime + (8 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 50000 };
      
      const fundingPayments = broker.updateMarkPrices(markPrices, eightHoursLater);
      
      expect(fundingPayments).toHaveLength(1);
      
      // Long receives funding when rate is negative: notional * (-rate) * -1 = positive
      // Payment = $50,000 * -0.0001 * -1 = +$5 (receives $5)
      expect(fundingPayments[0].payment).toBe(5);
    });
  });

  describe('Funding Payment Timing', () => {
    test('No funding payment before 8 hour interval', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime);

      // Advance time by 7 hours (less than 8 hour interval)
      const sevenHoursLater = baseTime + (7 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 50000 };
      
      const fundingPayments = broker.updateMarkPrices(markPrices, sevenHoursLater);
      
      expect(fundingPayments).toHaveLength(0);
    });

    test('Multiple funding payments over time', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime);

      // First funding payment after 8 hours
      const eightHoursLater = baseTime + (8 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 50000 };
      
      const firstPayment = broker.updateMarkPrices(markPrices, eightHoursLater);
      expect(firstPayment).toHaveLength(1);
      expect(firstPayment[0].payment).toBe(-5);

      // Second funding payment after another 8 hours
      const sixteenHoursLater = baseTime + (16 * 60 * 60 * 1000);
      const secondPayment = broker.updateMarkPrices(markPrices, sixteenHoursLater);
      expect(secondPayment).toHaveLength(1);
      expect(secondPayment[0].payment).toBe(-5);

      // Check position accumulated funding
      const position = broker.getPosition('BTCUSDT');
      expect(position?.accumulatedFunding).toBe(-10); // Two payments of -$5 each
    });

    test('Funding payment on position opened mid-interval', () => {
      const baseTime = Date.now();
      
      // Position opened 4 hours after funding time
      const openTime = baseTime + (4 * 60 * 60 * 1000);
      const context = {
        timestamp: openTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: openTime
        }
      };

      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime);

      // Check funding payment 4 hours later (should not trigger, only 4 hours since position open)
      const fourHoursAfterOpen = openTime + (4 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 50000 };
      
      const noPayment = broker.updateMarkPrices(markPrices, fourHoursAfterOpen);
      expect(noPayment).toHaveLength(0);

      // Check funding payment 8 hours after position open
      const eightHoursAfterOpen = openTime + (8 * 60 * 60 * 1000);
      const payment = broker.updateMarkPrices(markPrices, eightHoursAfterOpen);
      expect(payment).toHaveLength(1);
      expect(payment[0].payment).toBe(-5);
    });
  });

  describe('Funding Rate Calculation Formula', () => {
    test('Funding payment calculation formula is correct', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 60000,
          high: 60000,
          low: 60000,
          close: 60000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      // Open 2.5 BTC long position
      const result = broker.marketOrder('BTCUSDT', 'BUY', 2.5, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      // Set funding rate to 0.05% (0.0005)
      broker.setFundingRate('BTCUSDT', 0.0005, baseTime);

      const eightHoursLater = baseTime + (8 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 60000 };
      
      const fundingPayments = broker.updateMarkPrices(markPrices, eightHoursLater);
      
      // Formula: notional * fundingRate * (isLong ? -1 : 1)
      // Notional = 2.5 BTC * $60,000 = $150,000
      // Payment = $150,000 * 0.0005 * -1 = -$75 (long pays)
      expect(fundingPayments[0].payment).toBeCloseTo(-75, 6);
    });

    test('Funding with different position sizes', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      // Test multiple position sizes
      const testCases = [
        { size: 0.1, expected: -0.5 },   // 0.1 BTC * $50k * 0.0001 * -1 = -$0.5
        { size: 1.0, expected: -5 },     // 1.0 BTC * $50k * 0.0001 * -1 = -$5
        { size: 10.0, expected: -50 },   // 10.0 BTC * $50k * 0.0001 * -1 = -$50
      ];

      for (const testCase of testCases) {
        const broker = new Broker(100000, BINANCE_SPECS); // Fresh broker for each test
        
        const result = broker.marketOrder('BTCUSDT', 'BUY', testCase.size, context, 1, 'CROSS');
        expect(result.success).toBe(true);
        
        broker.setFundingRate('BTCUSDT', 0.0001, baseTime);

        const eightHoursLater = baseTime + (8 * 60 * 60 * 1000);
        const markPrices = { 'BTCUSDT': 50000 };
        
        const fundingPayments = broker.updateMarkPrices(markPrices, eightHoursLater);
        expect(fundingPayments[0].payment).toBeCloseTo(testCase.expected, 6);
      }
    });
  });

  describe('Edge Cases', () => {
    test('Zero funding rate produces zero payment', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      broker.setFundingRate('BTCUSDT', 0, baseTime);

      const eightHoursLater = baseTime + (8 * 60 * 60 * 1000);
      const markPrices = { 'BTCUSDT': 50000 };
      
      const fundingPayments = broker.updateMarkPrices(markPrices, eightHoursLater);
      expect(fundingPayments[0].payment).toBe(0);
    });

    test('Funding accumulates correctly over multiple periods', () => {
      const baseTime = Date.now();
      
      const context = {
        timestamp: baseTime,
        candle: {
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000,
          volume: 1000,
          timestamp: baseTime
        }
      };

      const result = broker.marketOrder('BTCUSDT', 'BUY', 1.0, context, 1, 'CROSS');
      expect(result.success).toBe(true);
      
      broker.setFundingRate('BTCUSDT', 0.0001, baseTime);

      // Accumulate funding over 3 periods (24 hours)
      for (let i = 1; i <= 3; i++) {
        const timeOffset = i * 8 * 60 * 60 * 1000;
        const markPrices = { 'BTCUSDT': 50000 };
        
        const fundingPayments = broker.updateMarkPrices(markPrices, baseTime + timeOffset);
        expect(fundingPayments[0].payment).toBe(-5);
      }

      const position = broker.getPosition('BTCUSDT');
      expect(position?.accumulatedFunding).toBe(-15); // 3 * -$5
    });
  });
});