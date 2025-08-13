# Data Collection Requirements for momentum-collector

The professional backtesting system needs additional data to be collected by your **momentum-collector** app. Here's what needs to be added:

## 1. Database Schema Setup

Run the SQL script in your momentum-collector database:
```bash
psql $DATABASE_URL -f schema-for-collector.sql
```

## 2. API Endpoints to Collect

### A. Funding Rates (High Priority) ⭐⭐⭐
- **Endpoint**: `GET /fapi/v1/fundingRate`
- **Frequency**: Every 8 hours at 00:00, 08:00, 16:00 UTC
- **Storage**: `funding_8h` table
- **Purpose**: Apply realistic funding costs to positions

```javascript
// Example collector code
async function collectFundingRates() {
  for (const symbol of SYMBOLS) {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=100`);
    const data = await response.json();
    
    for (const rate of data) {
      await pool.query(`
        INSERT INTO funding_8h (symbol, funding_time, funding_rate, mark_price)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (symbol, funding_time) DO NOTHING
      `, [symbol, new Date(rate.fundingTime), rate.fundingRate, rate.markPrice]);
    }
  }
}
```

### B. Mark Prices (High Priority) ⭐⭐⭐
- **Endpoint**: `GET /fapi/v1/premiumIndex`
- **Frequency**: Every minute
- **Storage**: `mark_prices` table
- **Purpose**: P&L calculation and liquidation (more accurate than last price)

```javascript
async function collectMarkPrices() {
  for (const symbol of SYMBOLS) {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const data = await response.json();
    
    await pool.query(`
      INSERT INTO mark_prices (symbol, ts, mark_price, index_price, premium)
      VALUES ($1, NOW(), $2, $3, $4)
      ON CONFLICT (symbol, ts) DO NOTHING
    `, [symbol, data.markPrice, data.indexPrice, data.estimatedSettlePrice - data.indexPrice]);
  }
}
```

### C. Exchange Specifications (Medium Priority) ⭐⭐
- **Endpoint**: `GET /fapi/v1/exchangeInfo`
- **Frequency**: Once daily or when specs change
- **Storage**: `exchange_specs` table
- **Purpose**: Dynamic tick sizes, lot sizes, leverage limits, fees

```javascript
async function collectExchangeSpecs() {
  const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
  const data = await response.json();
  
  for (const symbol of data.symbols) {
    const riskTiers = await getRiskTiers(symbol.symbol); // Additional API call needed
    
    await pool.query(`
      INSERT INTO exchange_specs (...)
      VALUES (...)
      ON CONFLICT (symbol) DO UPDATE SET ...
    `, [...]);
  }
}
```

### D. Open Interest (Low Priority) ⭐
- **Endpoint**: `GET /fapi/v1/openInterest`
- **Frequency**: Every hour
- **Storage**: `open_interest` table
- **Purpose**: Market sentiment and risk analysis

## 3. Enhanced L1 Snapshots

Your existing L1 collector just needs to add spread calculation:

```javascript
// In your existing L1 collector, add:
const spread_bps = ((askPrice - bidPrice) / ((bidPrice + askPrice) / 2)) * 10000;

await pool.query(`
  INSERT INTO l1_snapshots (symbol, ts, bid_price, bid_size, ask_price, ask_size, spread_bps)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`, [symbol, timestamp, bidPrice, bidSize, askPrice, askSize, spread_bps]);
```

## 4. Collection Schedule

```javascript
// Add to your momentum-collector scheduler:
setInterval(collectFundingRates, 8 * 60 * 60 * 1000);        // Every 8 hours
setInterval(collectMarkPrices, 60 * 1000);                   // Every minute  
setInterval(collectExchangeSpecs, 24 * 60 * 60 * 1000);      // Daily
setInterval(collectOpenInterest, 60 * 60 * 1000);            // Hourly
```

## 5. Impact on Backtesting

Once this data is collected, your backtests will automatically use:
- ✅ **Realistic funding costs** (major P&L impact)
- ✅ **Accurate mark prices** for P&L calculation  
- ✅ **Dynamic exchange specs** (fees, leverage, lot sizes)
- ✅ **Order book execution** with real spreads
- ✅ **Professional risk management** with proper margin calculations

## 6. Fallback Behavior

The backtesting system gracefully falls back:
- If professional data is missing → Uses basic OHLCV + features
- If funding rates missing → Assumes 0.01% funding rate
- If mark prices missing → Uses candle close price
- If exchange specs missing → Uses hardcoded Binance defaults

## 7. Priority Order

1. **Funding Rates** - Huge impact on strategy P&L
2. **Mark Prices** - More accurate P&L than last price
3. **Exchange Specs** - Dynamic fees and leverage limits
4. **Open Interest** - Nice to have for advanced strategies

Start with funding rates and mark prices for immediate professional-grade backtesting!