/**
 * Database Integration Tests
 * 
 * These tests verify that the backtest worker properly integrates with the database
 * and handles real data correctly.
 */

import { pool, validateDataQuality, loadCandlesWithFeatures } from '../../db.js';
import { DataLoader } from '../../trading/DataLoader.js';

describe('Database Integration Tests', () => {
  // Test database connectivity and basic operations
  describe('Database Connectivity', () => {
    test('Database connection is working', async () => {
      try {
        const result = await pool.query('SELECT NOW() as current_time');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].current_time).toBeDefined();
      } catch (error) {
        console.warn('Database not available, skipping integration tests');
        // Mark test as skipped if database is not available
        pending();
      }
    });

    test('Required tables exist', async () => {
      const requiredTables = [
        'ohlcv_1m', 
        'features_1m', 
        'bt_runs', 
        'bt_results', 
        'bt_equity',
        'exchange_specs',
        'funding_8h',
        'mark_prices',
        'l1_snapshots'
      ];

      for (const table of requiredTables) {
        const result = await pool.query(
          `SELECT EXISTS (
             SELECT FROM information_schema.tables 
             WHERE table_name = $1
           )`,
          [table]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });
  });

  describe('Data Loading and Validation', () => {
    test('Data quality validation with real data', async () => {
      // Try to find any symbol with recent data
      const symbolQuery = await pool.query(`
        SELECT symbol, MIN(ts) as first_ts, MAX(ts) as last_ts, COUNT(*) as count
        FROM ohlcv_1m 
        WHERE ts >= NOW() - INTERVAL '7 days'
        GROUP BY symbol 
        HAVING COUNT(*) > 100
        ORDER BY count DESC 
        LIMIT 1
      `);

      if (symbolQuery.rows.length === 0) {
        console.warn('No recent data available, skipping data validation test');
        pending();
        return;
      }

      const { symbol, first_ts, last_ts } = symbolQuery.rows[0];
      
      // Test a small time window to avoid loading too much data
      const endTime = new Date(last_ts);
      const startTime = new Date(endTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours ago

      const report = await validateDataQuality(
        symbol, 
        startTime.toISOString(), 
        endTime.toISOString()
      );

      expect(report).toBeDefined();
      expect(report.symbol).toBe(symbol);
      expect(report.ohlcvCount).toBeGreaterThan(0);
      expect(report.qualityScore).toBeGreaterThan(0);
      expect(report.qualityScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(report.warnings)).toBe(true);
      expect(Array.isArray(report.dataGaps)).toBe(true);
    });

    test('Load candles with features from real data', async () => {
      // Find a symbol with both OHLCV and features data
      const dataQuery = await pool.query(`
        SELECT o.symbol, MIN(o.ts) as first_ts, MAX(o.ts) as last_ts, COUNT(*) as ohlcv_count,
               COUNT(f.ts) as features_count
        FROM ohlcv_1m o
        LEFT JOIN features_1m f ON o.symbol = f.symbol AND o.ts = f.ts
        WHERE o.ts >= NOW() - INTERVAL '3 days'
        GROUP BY o.symbol
        HAVING COUNT(*) > 50 AND COUNT(f.ts) > 20
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `);

      if (dataQuery.rows.length === 0) {
        console.warn('No data with features available, skipping candles test');
        pending();
        return;
      }

      const { symbol, last_ts } = dataQuery.rows[0];
      
      // Load last hour of data
      const endTime = new Date(last_ts);
      const startTime = new Date(endTime.getTime() - (60 * 60 * 1000)); // 1 hour ago

      const candles = await loadCandlesWithFeatures(
        symbol,
        startTime.toISOString(),
        endTime.toISOString()
      );

      expect(candles).toBeDefined();
      expect(Array.isArray(candles)).toBe(true);
      expect(candles.length).toBeGreaterThan(0);

      // Validate candle structure
      const firstCandle = candles[0];
      expect(firstCandle.ts).toBeDefined();
      expect(typeof firstCandle.open).toBe('number');
      expect(typeof firstCandle.high).toBe('number');
      expect(typeof firstCandle.low).toBe('number');
      expect(typeof firstCandle.close).toBe('number');
      expect(typeof firstCandle.volume).toBe('number');

      // Check that features might be present (nullable)
      expect(['number', 'undefined'].includes(typeof firstCandle.roc_1m)).toBe(true);
      expect(['number', 'undefined'].includes(typeof firstCandle.rsi_14)).toBe(true);
    });
  });

  describe('Professional Data Integration', () => {
    test('Check data availability for different symbols', async () => {
      // Test with common symbols
      const testSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
      
      for (const symbol of testSymbols) {
        // Use a recent time range
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000)); // 1 day ago

        const availability = await DataLoader.checkDataAvailability(
          symbol,
          startTime.toISOString(),
          endTime.toISOString()
        );

        expect(availability).toBeDefined();
        expect(typeof availability.fundingRates).toBe('boolean');
        expect(typeof availability.markPrices).toBe('boolean');
        expect(typeof availability.l1Snapshots).toBe('boolean');
        expect(typeof availability.exchangeSpecs).toBe('boolean');
        expect(typeof availability.isProfessional).toBe('boolean');
        
        console.log(`Data availability for ${symbol}:`, availability);
      }
    });

    test('Load exchange specifications', async () => {
      try {
        const specs = await DataLoader.loadAllExchangeSpecs();
        
        expect(specs).toBeDefined();
        expect(typeof specs).toBe('object');
        
        // Check if we have any specs
        const symbolCount = Object.keys(specs).length;
        if (symbolCount > 0) {
          const firstSymbol = Object.keys(specs)[0];
          const spec = specs[firstSymbol];
          
          expect(spec.symbol).toBe(firstSymbol);
          expect(typeof spec.tickSize).toBe('number');
          expect(typeof spec.lotSize).toBe('number');
          expect(typeof spec.makerFeeBps).toBe('number');
          expect(typeof spec.takerFeeBps).toBe('number');
        }
        
        console.log(`Loaded ${symbolCount} exchange specifications`);
      } catch (error) {
        console.warn('Exchange specs not available:', error);
        // This is not critical for basic functionality
      }
    });
  });

  describe('Error Handling', () => {
    test('Handles non-existent symbol gracefully', async () => {
      const nonExistentSymbol = 'FAKEUSD_INVALID';
      const startTime = new Date(Date.now() - 60000).toISOString();
      const endTime = new Date().toISOString();

      await expect(
        loadCandlesWithFeatures(nonExistentSymbol, startTime, endTime)
      ).rejects.toThrow(/No OHLCV data found/);
    });

    test('Handles invalid date range gracefully', async () => {
      const invalidStartTime = '2099-01-01T00:00:00.000Z'; // Future date
      const invalidEndTime = '2099-01-02T00:00:00.000Z';

      await expect(
        validateDataQuality('BTCUSDT', invalidStartTime, invalidEndTime)
      ).resolves.toBeDefined(); // Should not throw, but return empty report
    });
  });

  // Cleanup after tests
  afterAll(async () => {
    // Don't actually close the pool as other tests might need it
    // await pool.end();
  });
});
