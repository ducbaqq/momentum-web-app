import { roundToTickSize, roundToLotSize, validateOrderSize, BINANCE_SPECS } from '../../trading/ExchangeSpec.js';

describe('Quantity and Price Rounding', () => {
  describe('Price Rounding (Tick Size)', () => {
    test('BTC price rounding to 0.1 tick size', () => {
      const tickSize = 0.1;
      
      const testCases = [
        { input: 50000, expected: 50000 },      // Exact tick
        { input: 50000.05, expected: 50000 },   // Round down
        { input: 50000.06, expected: 50000.1 }, // Round up
        { input: 50000.1, expected: 50000.1 },  // Exact tick
        { input: 50000.14, expected: 50000.1 }, // Round down
        { input: 50000.15, expected: 50000.2 }, // Round up
        { input: 49999.95, expected: 50000 },   // Round up
        { input: 49999.94, expected: 49999.9 }  // Round down
      ];

      for (const testCase of testCases) {
        const result = roundToTickSize(testCase.input, tickSize);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('ETH price rounding to 0.01 tick size', () => {
      const tickSize = 0.01;
      
      const testCases = [
        { input: 3000, expected: 3000 },          // Exact tick
        { input: 3000.005, expected: 3000.01 },   // Round up
        { input: 3000.004, expected: 3000 },      // Round down
        { input: 2999.999, expected: 3000 },      // Round up
        { input: 2999.994, expected: 2999.99 },   // Round down
        { input: 3000.126, expected: 3000.13 },   // Round up
        { input: 3000.124, expected: 3000.12 }    // Round down
      ];

      for (const testCase of testCases) {
        const result = roundToTickSize(testCase.input, tickSize);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('Edge cases for tick size rounding', () => {
      // Test very small tick sizes
      expect(roundToTickSize(100.12345, 0.00001)).toBeCloseTo(100.12345, 10);
      expect(roundToTickSize(100.123456, 0.00001)).toBeCloseTo(100.12346, 10);
      
      // Test large tick sizes
      expect(roundToTickSize(12345.67, 100)).toBe(12300);
      expect(roundToTickSize(12350.67, 100)).toBe(12400);
      
      // Test zero and negative values
      expect(roundToTickSize(0, 0.1)).toBe(0);
      expect(roundToTickSize(-50.15, 0.1)).toBeCloseTo(-50.1, 10);
    });

    test('Floating point precision in tick rounding', () => {
      // Test that rounding doesn't introduce floating point errors
      const tickSize = 0.1;
      const prices = [50000.1, 50000.2, 50000.3, 50000.4, 50000.5];
      
      for (const price of prices) {
        const rounded = roundToTickSize(price, tickSize);
        // Should be exactly divisible by tick size (within floating point precision)
        const remainder = rounded % tickSize;
        expect(Math.abs(remainder)).toBeLessThan(1e-10);
      }
    });
  });

  describe('Quantity Rounding (Lot Size)', () => {
    test('BTC quantity rounding to 0.001 lot size', () => {
      const lotSize = 0.001;
      
      const testCases = [
        { input: 1, expected: 1 },            // Exact lot
        { input: 1.0005, expected: 1 },       // Round down
        { input: 1.001, expected: 1.001 },    // Exact lot
        { input: 1.0014, expected: 1.001 },   // Round down
        { input: 0.999, expected: 0.999 },    // Round down
        { input: 0.9995, expected: 0.999 },   // Round down
        { input: 0.0005, expected: 0 },       // Round down to zero
        { input: 10.12345, expected: 10.123 } // Round down
      ];

      for (const testCase of testCases) {
        const result = roundToLotSize(testCase.input, lotSize);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('ETH quantity rounding to 0.001 lot size', () => {
      const lotSize = 0.001;
      
      const testCases = [
        { input: 10, expected: 10 },
        { input: 10.0009, expected: 10 },
        { input: 10.001, expected: 10.001 },
        { input: 0.5678, expected: 0.567 },
        { input: 100.999999, expected: 100.999 }
      ];

      for (const testCase of testCases) {
        const result = roundToLotSize(testCase.input, lotSize);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('Lot size rounding always rounds down (floor)', () => {
      const lotSize = 0.01;
      
      const testCases = [
        { input: 1.019, expected: 1.01 },  // Should floor, not round to nearest
        { input: 1.018, expected: 1.01 },
        { input: 1.011, expected: 1.01 },
        { input: 1.009, expected: 1.00 }
      ];

      for (const testCase of testCases) {
        const result = roundToLotSize(testCase.input, lotSize);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('Negative quantities are handled correctly', () => {
      const lotSize = 0.001;
      
      // Negative quantities should be made positive and rounded
      expect(roundToLotSize(-1.5678, lotSize)).toBeCloseTo(1.567, 10);
      expect(roundToLotSize(-0.0005, lotSize)).toBe(0);
    });
  });

  describe('Order Size Validation', () => {
    test('BTC order size validation', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      
      const testCases = [
        { input: 0.5, expected: 0.5 },        // Valid size
        { input: 0.0005, expected: 0.001 },   // Below min, adjust to min
        { input: 1500, expected: 1000 },      // Above max, adjust to max
        { input: 1.2345, expected: 1.234 },   // Round to lot size
        { input: 0, expected: 0.001 },        // Zero, adjust to min
        { input: -0.5, expected: 0.001 }      // Negative, adjust to min
      ];

      for (const testCase of testCases) {
        const result = validateOrderSize(testCase.input, btcSpec);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('ETH order size validation', () => {
      const ethSpec = BINANCE_SPECS['ETHUSDT'];
      
      const testCases = [
        { input: 5.0, expected: 5.0 },        // Valid size
        { input: 0.0005, expected: 0.001 },   // Below min, adjust to min
        { input: 15000, expected: 10000 },    // Above max, adjust to max
        { input: 10.7894, expected: 10.789 }, // Round to lot size
        { input: 0, expected: 0.001 }         // Zero, adjust to min
      ];

      for (const testCase of testCases) {
        const result = validateOrderSize(testCase.input, ethSpec);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('Order validation maintains lot size increments', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      const lotSize = btcSpec.lotSize; // 0.001
      
      const randomSizes = [0.5555, 1.7777, 2.3456, 10.9999];
      
      for (const size of randomSizes) {
        const validated = validateOrderSize(size, btcSpec);
        
        // Result should be divisible by lot size
        const remainder = validated % lotSize;
        expect(Math.abs(remainder)).toBeLessThan(1e-10);
        
        // Result should be within valid range
        expect(validated).toBeGreaterThanOrEqual(btcSpec.minOrderSize);
        expect(validated).toBeLessThanOrEqual(btcSpec.maxOrderSize);
      }
    });
  });

  describe('Precision and Floating Point Handling', () => {
    test('Consistent rounding with floating point arithmetic', () => {
      const lotSize = 0.001;
      
      // Test repeated operations don't accumulate errors
      let quantity = 1.0;
      for (let i = 0; i < 1000; i++) {
        quantity += 0.0001; // Add a tiny amount
        const rounded = roundToLotSize(quantity, lotSize);
        
        // Should remain precise
        expect(rounded % lotSize).toBeLessThan(1e-10);
        expect(rounded).toBeLessThanOrEqual(quantity);
      }
    });

    test('Rounding with very small lot sizes', () => {
      const verySmallLotSize = 0.00000001; // 8 decimal places
      
      const testCases = [
        { input: 0.123456789, expected: 0.12345678 },
        { input: 1.000000005, expected: 1 },
        { input: 0.000000015, expected: 0.00000001 }
      ];

      for (const testCase of testCases) {
        const result = roundToLotSize(testCase.input, verySmallLotSize);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });

    test('Tick size rounding with high precision prices', () => {
      const tickSize = 0.00001; // 5 decimal places
      
      const testCases = [
        { input: 12345.123456, expected: 12345.12346 },
        { input: 0.000005, expected: 0 },
        { input: 99999.999999, expected: 100000 }
      ];

      for (const testCase of testCases) {
        const result = roundToTickSize(testCase.input, tickSize);
        expect(result).toBeCloseTo(testCase.expected, 10);
      }
    });
  });

  describe('Exchange Specification Compliance', () => {
    test('BTC specification values are reasonable', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      
      // Check that specifications make sense
      expect(btcSpec.tickSize).toBe(0.1);      // $0.10 price increments
      expect(btcSpec.lotSize).toBe(0.001);     // 0.001 BTC increments
      expect(btcSpec.minOrderSize).toBe(0.001); // Min 0.001 BTC
      expect(btcSpec.maxOrderSize).toBe(1000);  // Max 1000 BTC
      
      // Validate relationships
      expect(btcSpec.minOrderSize).toBeGreaterThan(0);
      expect(btcSpec.maxOrderSize).toBeGreaterThan(btcSpec.minOrderSize);
      expect(btcSpec.lotSize).toBeGreaterThan(0);
      expect(btcSpec.tickSize).toBeGreaterThan(0);
    });

    test('ETH specification values are reasonable', () => {
      const ethSpec = BINANCE_SPECS['ETHUSDT'];
      
      expect(ethSpec.tickSize).toBe(0.01);     // $0.01 price increments
      expect(ethSpec.lotSize).toBe(0.001);     // 0.001 ETH increments
      expect(ethSpec.minOrderSize).toBe(0.001); // Min 0.001 ETH
      expect(ethSpec.maxOrderSize).toBe(10000); // Max 10000 ETH
      
      // ETH should allow larger positions than BTC
      expect(ethSpec.maxOrderSize).toBeGreaterThan(BINANCE_SPECS['BTCUSDT'].maxOrderSize);
    });

    test('Order validation respects exchange limits in practice', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      
      // Test real-world order sizes
      const practicalSizes = [0.01, 0.1, 1, 10, 50];
      
      for (const size of practicalSizes) {
        const validated = validateOrderSize(size, btcSpec);
        
        // Should be within exchange limits
        expect(validated).toBeGreaterThanOrEqual(btcSpec.minOrderSize);
        expect(validated).toBeLessThanOrEqual(btcSpec.maxOrderSize);
        
        // Should be properly rounded to lot size
        expect(validated % btcSpec.lotSize).toBeLessThan(1e-10);
      }
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('Zero lot size handling', () => {
      // Should not cause division by zero
      expect(() => roundToLotSize(1.5, 0)).not.toThrow();
      const result = roundToLotSize(1.5, 0);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    test('Zero tick size handling', () => {
      expect(() => roundToTickSize(100.5, 0)).not.toThrow();
      const result = roundToTickSize(100.5, 0);
      expect(result).toBe(100.5); // Should return original value
    });

    test('Very large numbers handling', () => {
      const largeNumber = 1e15;
      const lotSize = 0.001;
      
      const result = roundToLotSize(largeNumber, lotSize);
      expect(result).toBeLessThanOrEqual(largeNumber);
      expect(isFinite(result)).toBe(true);
      expect(result).not.toBeNaN();
    });

    test('Very small numbers handling', () => {
      const tinyNumber = 1e-10;
      const lotSize = 0.001;
      
      const result = roundToLotSize(tinyNumber, lotSize);
      expect(result).toBe(0); // Should round down to zero
      expect(isFinite(result)).toBe(true);
      expect(result).not.toBeNaN();
    });
  });
});