import { pool } from '../db.js';
import type { Candle } from '../types.js';
import { ExchangeSpec } from './ExchangeSpec.js';
import { L1Snapshot } from './Executor.js';

export interface ProfessionalCandle extends Candle {
  // Enhanced with professional data
  markPrice?: number;        // From mark_prices table
  fundingRate?: number;      // From funding_8h table  
  openInterest?: number;     // From open_interest table
  l1Snapshot?: L1Snapshot;   // From l1_snapshots table
}

export interface FundingRate {
  symbol: string;
  fundingTime: string;
  fundingRate: number;
  markPrice?: number;
}

export interface MarkPrice {
  symbol: string;
  timestamp: string;
  markPrice: number;
  indexPrice?: number;
  premium?: number;
}

export class DataLoader {
  // Load candles with all professional data joined
  static async loadProfessionalCandles(
    symbol: string, 
    start: string, 
    end: string
  ): Promise<ProfessionalCandle[]> {
    
    const query = `
      WITH base_candles AS (
        SELECT
          o.ts,
          o.open, o.high, o.low, o.close, o.volume,
          f.roc_1m, f.roc_5m, f.roc_15m, f.roc_30m, f.roc_1h, f.roc_4h,
          f.rsi_14, f.ema_20, f.ema_50, f.macd, f.macd_signal,
          f.bb_upper, f.bb_lower, f.vol_avg_20, f.vol_mult, 
          f.book_imb, f.spread_bps as features_spread
        FROM ohlcv_1m o
        LEFT JOIN features_1m f ON f.symbol = o.symbol AND f.ts = o.ts
        WHERE o.symbol = $1 AND o.ts >= $2 AND o.ts <= $3
        ORDER BY o.ts ASC
      )
      SELECT 
        bc.*,
        -- Mark prices (prefer mark_prices table, fallback to close)
        COALESCE(mp.mark_price, bc.close) as mark_price,
        mp.index_price,
        mp.premium,
        
        -- L1 snapshots for realistic execution
        l1.bid_price,
        l1.bid_size, 
        l1.ask_price,
        l1.ask_size,
        COALESCE(l1.spread_bps, bc.features_spread) as spread_bps,
        
        -- Funding rates (get rate at or before this timestamp)
        fr.funding_rate,
        
        -- Open interest
        oi.open_interest,
        oi.open_interest_value
        
      FROM base_candles bc
      
      -- Left join mark prices (closest timestamp)
      LEFT JOIN LATERAL (
        SELECT mark_price, index_price, premium
        FROM mark_prices mp2
        WHERE mp2.symbol = $1 
        AND mp2.ts <= bc.ts
        ORDER BY mp2.ts DESC
        LIMIT 1
      ) mp ON true
      
      -- Left join L1 snapshots (closest timestamp)  
      LEFT JOIN LATERAL (
        SELECT bid_price, bid_size, ask_price, ask_size, spread_bps
        FROM l1_snapshots l1s
        WHERE l1s.symbol = $1
        AND l1s.ts <= bc.ts  
        ORDER BY l1s.ts DESC
        LIMIT 1
      ) l1 ON true
      
      -- Left join funding rates (most recent rate)
      LEFT JOIN LATERAL (
        SELECT funding_rate
        FROM funding_8h fr2
        WHERE fr2.symbol = $1
        AND fr2.funding_time <= bc.ts
        ORDER BY fr2.funding_time DESC
        LIMIT 1
      ) fr ON true
      
      -- Left join open interest (closest timestamp)
      LEFT JOIN LATERAL (
        SELECT open_interest, open_interest_value
        FROM open_interest oi2  
        WHERE oi2.symbol = $1
        AND oi2.ts <= bc.ts
        ORDER BY oi2.ts DESC
        LIMIT 1
      ) oi ON true
      
      ORDER BY bc.ts ASC
    `;

    const result = await pool.query(query, [symbol, start, end]);
    
    if (result.rows.length === 0) {
      throw new Error(`No professional data found for ${symbol} between ${start} and ${end}`);
    }
    
    console.log(`Loaded ${result.rows.length} professional candles for ${symbol}`);
    
    return result.rows.map(row => ({
      // Base candle data
      ts: row.ts,
      open: Number(row.open),
      high: Number(row.high), 
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      
      // Technical indicators
      roc_1m: row.roc_1m,
      roc_5m: row.roc_5m,
      roc_15m: row.roc_15m,
      roc_30m: row.roc_30m,
      roc_1h: row.roc_1h,
      roc_4h: row.roc_4h,
      rsi_14: row.rsi_14,
      ema_20: row.ema_20,
      ema_50: row.ema_50,
      macd: row.macd,
      macd_signal: row.macd_signal,
      bb_upper: row.bb_upper,
      bb_lower: row.bb_lower,
      vol_avg_20: row.vol_avg_20,
      vol_mult: row.vol_mult,
      book_imb: row.book_imb,
      spread_bps: row.spread_bps,
      
      // Professional data
      markPrice: row.mark_price ? Number(row.mark_price) : undefined,
      fundingRate: row.funding_rate ? Number(row.funding_rate) : undefined,
      openInterest: row.open_interest ? Number(row.open_interest) : undefined,
      
      // L1 snapshot for execution
      l1Snapshot: (row.bid_price && row.ask_price) ? {
        symbol,
        timestamp: new Date(row.ts).getTime(),
        bidPrice: Number(row.bid_price),
        bidSize: Number(row.bid_size || 0),
        askPrice: Number(row.ask_price), 
        askSize: Number(row.ask_size || 0)
      } : undefined
    }));
  }

  // Load historical funding rates
  static async loadFundingRates(
    symbol: string,
    start: string,
    end: string
  ): Promise<FundingRate[]> {
    const query = `
      SELECT symbol, funding_time, funding_rate, mark_price
      FROM funding_8h
      WHERE symbol = $1 
      AND funding_time >= $2 
      AND funding_time <= $3
      ORDER BY funding_time ASC
    `;
    
    const result = await pool.query(query, [symbol, start, end]);
    
    return result.rows.map(row => ({
      symbol: row.symbol,
      fundingTime: row.funding_time,
      fundingRate: Number(row.funding_rate),
      markPrice: row.mark_price ? Number(row.mark_price) : undefined
    }));
  }

  // Load dynamic exchange specifications
  static async loadExchangeSpec(symbol: string): Promise<ExchangeSpec | null> {
    const query = `
      SELECT * FROM exchange_specs WHERE symbol = $1
    `;
    
    const result = await pool.query(query, [symbol]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    
    return {
      symbol: row.symbol,
      tickSize: Number(row.tick_size),
      lotSize: Number(row.lot_size),
      minOrderSize: Number(row.min_order_size),
      maxOrderSize: Number(row.max_order_size),
      maxLeverage: row.max_leverage,
      leverageStep: 1, // Default
      makerFeeBps: Number(row.maker_fee_bps),
      takerFeeBps: Number(row.taker_fee_bps),
      riskTiers: row.risk_tiers, // Already parsed as JSON by pg
      fundingInterval: row.funding_interval || 8,
      maxFundingRate: Number(row.max_funding_rate || 0.0075),
      priceDeviationLimit: Number(row.price_deviation_limit || 0.1)
    };
  }

  // Load all exchange specs
  static async loadAllExchangeSpecs(): Promise<Record<string, ExchangeSpec>> {
    const query = `SELECT * FROM exchange_specs ORDER BY symbol`;
    const result = await pool.query(query);
    
    const specs: Record<string, ExchangeSpec> = {};
    
    for (const row of result.rows) {
      specs[row.symbol] = {
        symbol: row.symbol,
        tickSize: Number(row.tick_size),
        lotSize: Number(row.lot_size),
        minOrderSize: Number(row.min_order_size),
        maxOrderSize: Number(row.max_order_size),
        maxLeverage: row.max_leverage,
        leverageStep: 1,
        makerFeeBps: Number(row.maker_fee_bps),
        takerFeeBps: Number(row.taker_fee_bps),
        riskTiers: row.risk_tiers,
        fundingInterval: row.funding_interval || 8,
        maxFundingRate: Number(row.max_funding_rate || 0.0075),
        priceDeviationLimit: Number(row.price_deviation_limit || 0.1)
      };
    }
    
    return specs;
  }

  // Check if professional data is available
  static async checkDataAvailability(symbol: string, start: string, end: string) {
    try {
      const checks = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM funding_8h WHERE symbol = $1 AND funding_time >= $2 AND funding_time <= $3', [symbol, start, end]),
        pool.query('SELECT COUNT(*) as count FROM mark_prices WHERE symbol = $1 AND ts >= $2 AND ts <= $3', [symbol, start, end]),
        pool.query('SELECT COUNT(*) as count FROM l1_snapshots WHERE symbol = $1 AND ts >= $2 AND ts <= $3', [symbol, start, end]),
        pool.query('SELECT COUNT(*) as count FROM exchange_specs WHERE symbol = $1', [symbol])
      ]);

      const availability = {
        fundingRates: Number(checks[0].rows[0].count) > 0,
        markPrices: Number(checks[1].rows[0].count) > 0, 
        l1Snapshots: Number(checks[2].rows[0].count) > 0,
        exchangeSpecs: Number(checks[3].rows[0].count) > 0,
        isProfessional: false
      };
      
      // Only consider it professional if we have at least basic professional data
      availability.isProfessional = availability.fundingRates && availability.markPrices && availability.exchangeSpecs;
      
      console.log(`Data availability for ${symbol}: funding=${availability.fundingRates}, marks=${availability.markPrices}, l1=${availability.l1Snapshots}, specs=${availability.exchangeSpecs}`);
      
      return availability;
    } catch (error) {
      console.error(`Error checking data availability for ${symbol}:`, error);
      // Return safe defaults on error
      return {
        fundingRates: false,
        markPrices: false,
        l1Snapshots: false,
        exchangeSpecs: false,
        isProfessional: false
      };
    }
  }
}