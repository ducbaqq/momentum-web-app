import { getRiskTier, BINANCE_SPECS } from '../../trading/ExchangeSpec.js';

describe('Risk Tier Calculations', () => {
  describe('BTC Risk Tiers', () => {
    const btcSpec = BINANCE_SPECS['BTCUSDT'];

    test('Tier 1: Up to $50,000 notional', () => {
      const testCases = [
        { notional: 1000, expected: { initialMarginRate: 0.004, maintenanceMarginRate: 0.002 } },
        { notional: 25000, expected: { initialMarginRate: 0.004, maintenanceMarginRate: 0.002 } },
        { notional: 49999, expected: { initialMarginRate: 0.004, maintenanceMarginRate: 0.002 } },
        { notional: 50000, expected: { initialMarginRate: 0.004, maintenanceMarginRate: 0.002 } }
      ];

      for (const testCase of testCases) {
        const tier = getRiskTier(btcSpec, testCase.notional);
        expect(tier.maxNotional).toBe(50000);
        expect(tier.initialMarginRate).toBe(testCase.expected.initialMarginRate);
        expect(tier.maintenanceMarginRate).toBe(testCase.expected.maintenanceMarginRate);
      }
    });

    test('Tier 2: $50,001 to $250,000 notional', () => {
      const testCases = [
        { notional: 50001, expected: { initialMarginRate: 0.005, maintenanceMarginRate: 0.0025 } },
        { notional: 100000, expected: { initialMarginRate: 0.005, maintenanceMarginRate: 0.0025 } },
        { notional: 250000, expected: { initialMarginRate: 0.005, maintenanceMarginRate: 0.0025 } }
      ];

      for (const testCase of testCases) {
        const tier = getRiskTier(btcSpec, testCase.notional);
        expect(tier.maxNotional).toBe(250000);
        expect(tier.initialMarginRate).toBe(testCase.expected.initialMarginRate);
        expect(tier.maintenanceMarginRate).toBe(testCase.expected.maintenanceMarginRate);
      }
    });

    test('Tier 3: $250,001 to $1,000,000 notional', () => {
      const testCases = [
        { notional: 250001, expected: { initialMarginRate: 0.01, maintenanceMarginRate: 0.005 } },
        { notional: 500000, expected: { initialMarginRate: 0.01, maintenanceMarginRate: 0.005 } },
        { notional: 1000000, expected: { initialMarginRate: 0.01, maintenanceMarginRate: 0.005 } }
      ];

      for (const testCase of testCases) {
        const tier = getRiskTier(btcSpec, testCase.notional);
        expect(tier.maxNotional).toBe(1000000);
        expect(tier.initialMarginRate).toBe(testCase.expected.initialMarginRate);
        expect(tier.maintenanceMarginRate).toBe(testCase.expected.maintenanceMarginRate);
      }
    });

    test('Tier 4: $1,000,001 to $5,000,000 notional', () => {
      const testCases = [
        { notional: 1000001, expected: { initialMarginRate: 0.025, maintenanceMarginRate: 0.0125 } },
        { notional: 2500000, expected: { initialMarginRate: 0.025, maintenanceMarginRate: 0.0125 } },
        { notional: 5000000, expected: { initialMarginRate: 0.025, maintenanceMarginRate: 0.0125 } }
      ];

      for (const testCase of testCases) {
        const tier = getRiskTier(btcSpec, testCase.notional);
        expect(tier.maxNotional).toBe(5000000);
        expect(tier.initialMarginRate).toBe(testCase.expected.initialMarginRate);
        expect(tier.maintenanceMarginRate).toBe(testCase.expected.maintenanceMarginRate);
      }
    });

    test('Tier 5: Above $5,000,000 notional', () => {
      const testCases = [
        { notional: 5000001, expected: { initialMarginRate: 0.05, maintenanceMarginRate: 0.025 } },
        { notional: 10000000, expected: { initialMarginRate: 0.05, maintenanceMarginRate: 0.025 } },
        { notional: 50000000, expected: { initialMarginRate: 0.05, maintenanceMarginRate: 0.025 } }
      ];

      for (const testCase of testCases) {
        const tier = getRiskTier(btcSpec, testCase.notional);
        expect(tier.maxNotional).toBe(Infinity);
        expect(tier.initialMarginRate).toBe(testCase.expected.initialMarginRate);
        expect(tier.maintenanceMarginRate).toBe(testCase.expected.maintenanceMarginRate);
      }
    });
  });

  describe('ETH Risk Tiers', () => {
    const ethSpec = BINANCE_SPECS['ETHUSDT'];

    test('ETH has different tier boundaries than BTC', () => {
      // ETH Tier 1: Up to $25,000 (vs BTC's $50,000)
      const ethTier1 = getRiskTier(ethSpec, 25000);
      const ethTier2 = getRiskTier(ethSpec, 25001);
      
      expect(ethTier1.maxNotional).toBe(25000);
      expect(ethTier1.initialMarginRate).toBe(0.005); // 0.5%
      expect(ethTier1.maintenanceMarginRate).toBe(0.0025); // 0.25%
      
      expect(ethTier2.maxNotional).toBe(100000);
      expect(ethTier2.initialMarginRate).toBe(0.0075); // 0.75%
      expect(ethTier2.maintenanceMarginRate).toBe(0.00375); // 0.375%
    });

    test('ETH Tier progression is correct', () => {
      const testCases = [
        { notional: 10000, expectedMaxNotional: 25000, expectedInitial: 0.005 },
        { notional: 50000, expectedMaxNotional: 100000, expectedInitial: 0.0075 },
        { notional: 300000, expectedMaxNotional: 500000, expectedInitial: 0.01 },
        { notional: 750000, expectedMaxNotional: 1000000, expectedInitial: 0.025 },
        { notional: 2000000, expectedMaxNotional: Infinity, expectedInitial: 0.05 }
      ];

      for (const testCase of testCases) {
        const tier = getRiskTier(ethSpec, testCase.notional);
        expect(tier.maxNotional).toBe(testCase.expectedMaxNotional);
        expect(tier.initialMarginRate).toBe(testCase.expectedInitial);
      }
    });
  });

  describe('Risk Tier Boundary Edge Cases', () => {
    const btcSpec = BINANCE_SPECS['BTCUSDT'];

    test('Exact boundary values select correct tier', () => {
      const boundaries = [50000, 250000, 1000000, 5000000];
      
      for (const boundary of boundaries) {
        const exactTier = getRiskTier(btcSpec, boundary);
        const justOverTier = getRiskTier(btcSpec, boundary + 1);
        
        // Exact boundary should be in current tier, +1 should be in next tier
        expect(exactTier.maxNotional).toBe(boundary);
        expect(justOverTier.maxNotional).toBeGreaterThan(boundary);
      }
    });

    test('Zero notional value', () => {
      const tier = getRiskTier(btcSpec, 0);
      expect(tier.maxNotional).toBe(50000);
      expect(tier.initialMarginRate).toBe(0.004);
      expect(tier.maintenanceMarginRate).toBe(0.002);
    });

    test('Negative notional value', () => {
      const tier = getRiskTier(btcSpec, -1000);
      expect(tier.maxNotional).toBe(50000);
      expect(tier.initialMarginRate).toBe(0.004);
      expect(tier.maintenanceMarginRate).toBe(0.002);
    });

    test('Very large notional values use highest tier', () => {
      const enormousValues = [100000000, 1000000000, Number.MAX_SAFE_INTEGER];
      
      for (const value of enormousValues) {
        const tier = getRiskTier(btcSpec, value);
        expect(tier.maxNotional).toBe(Infinity);
        expect(tier.initialMarginRate).toBe(0.05); // 5%
        expect(tier.maintenanceMarginRate).toBe(0.025); // 2.5%
      }
    });
  });

  describe('Margin Calculation Examples', () => {
    test('Calculate initial margin for different position sizes', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      
      const testCases = [
        { 
          notional: 10000, // $10k position
          expectedInitialMargin: 10000 * 0.004, // Tier 1: 0.4%
          expectedMaintenanceMargin: 10000 * 0.002 // Tier 1: 0.2%
        },
        { 
          notional: 100000, // $100k position
          expectedInitialMargin: 100000 * 0.005, // Tier 2: 0.5%
          expectedMaintenanceMargin: 100000 * 0.0025 // Tier 2: 0.25%
        },
        { 
          notional: 500000, // $500k position
          expectedInitialMargin: 500000 * 0.01, // Tier 3: 1%
          expectedMaintenanceMargin: 500000 * 0.005 // Tier 3: 0.5%
        },
        { 
          notional: 3000000, // $3M position
          expectedInitialMargin: 3000000 * 0.025, // Tier 4: 2.5%
          expectedMaintenanceMargin: 3000000 * 0.0125 // Tier 4: 1.25%
        },
        { 
          notional: 10000000, // $10M position
          expectedInitialMargin: 10000000 * 0.05, // Tier 5: 5%
          expectedMaintenanceMargin: 10000000 * 0.025 // Tier 5: 2.5%
        }
      ];

      for (const testCase of testCases) {
        const tier = getRiskTier(btcSpec, testCase.notional);
        const initialMargin = testCase.notional * tier.initialMarginRate;
        const maintenanceMargin = testCase.notional * tier.maintenanceMarginRate;
        
        expect(initialMargin).toBeCloseTo(testCase.expectedInitialMargin, 6);
        expect(maintenanceMargin).toBeCloseTo(testCase.expectedMaintenanceMargin, 6);
      }
    });

    test('Progressive risk increases with position size', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      const positionSizes = [10000, 100000, 500000, 2000000, 10000000];
      
      let previousInitialRate = 0;
      let previousMaintenanceRate = 0;
      
      for (const size of positionSizes) {
        const tier = getRiskTier(btcSpec, size);
        
        // Each tier should have equal or higher margin requirements
        expect(tier.initialMarginRate).toBeGreaterThanOrEqual(previousInitialRate);
        expect(tier.maintenanceMarginRate).toBeGreaterThanOrEqual(previousMaintenanceRate);
        
        previousInitialRate = tier.initialMarginRate;
        previousMaintenanceRate = tier.maintenanceMarginRate;
      }
    });
  });

  describe('Cross-Symbol Risk Tier Comparison', () => {
    test('BTC vs ETH risk tier differences', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      const ethSpec = BINANCE_SPECS['ETHUSDT'];
      
      // Compare same notional amounts across symbols
      const testNotionals = [20000, 80000, 400000, 800000];
      
      for (const notional of testNotionals) {
        const btcTier = getRiskTier(btcSpec, notional);
        const ethTier = getRiskTier(ethSpec, notional);
        
        // ETH generally has stricter (higher) margin requirements at same notional
        if (notional <= 25000) {
          // At low notionals, ETH may have higher initial margins
          expect(ethTier.initialMarginRate).toBeGreaterThanOrEqual(btcTier.initialMarginRate * 0.8);
        }
        
        // Both should have reasonable margin requirements
        expect(btcTier.initialMarginRate).toBeGreaterThan(0);
        expect(btcTier.initialMarginRate).toBeLessThan(0.1); // Less than 10%
        expect(ethTier.initialMarginRate).toBeGreaterThan(0);
        expect(ethTier.initialMarginRate).toBeLessThan(0.1); // Less than 10%
      }
    });
  });

  describe('Risk Tier Performance and Edge Cases', () => {
    test('Risk tier calculation performance with many lookups', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      const startTime = performance.now();
      
      // Perform many risk tier lookups
      for (let i = 0; i < 10000; i++) {
        const randomNotional = Math.random() * 20000000;
        getRiskTier(btcSpec, randomNotional);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete quickly (less than 100ms for 10k lookups)
      expect(duration).toBeLessThan(100);
    });

    test('Risk tier data integrity', () => {
      const btcSpec = BINANCE_SPECS['BTCUSDT'];
      const ethSpec = BINANCE_SPECS['ETHUSDT'];
      
      // Verify risk tiers are sorted correctly
      for (let i = 1; i < btcSpec.riskTiers.length; i++) {
        expect(btcSpec.riskTiers[i].maxNotional).toBeGreaterThanOrEqual(
          btcSpec.riskTiers[i - 1].maxNotional
        );
        expect(btcSpec.riskTiers[i].initialMarginRate).toBeGreaterThanOrEqual(
          btcSpec.riskTiers[i - 1].initialMarginRate
        );
      }
      
      for (let i = 1; i < ethSpec.riskTiers.length; i++) {
        expect(ethSpec.riskTiers[i].maxNotional).toBeGreaterThanOrEqual(
          ethSpec.riskTiers[i - 1].maxNotional
        );
        expect(ethSpec.riskTiers[i].initialMarginRate).toBeGreaterThanOrEqual(
          ethSpec.riskTiers[i - 1].initialMarginRate
        );
      }
    });
  });
});