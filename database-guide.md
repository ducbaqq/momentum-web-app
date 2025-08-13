# Database Agent Guide for Momentum-Collector

## Overview
This guide provides the essential knowledge an agent needs to effectively work with the momentum-collector database. The agent needs more than just schema - it needs semantic understanding of the data.

## 🏗️ Database Architecture

### Core Data Types
1. **Market Data** - Raw price/volume data from Binance
2. **Professional Data** - Futures-specific metrics (funding, mark prices, open interest)  
3. **Technical Features** - Calculated indicators and signals
4. **Trading Data** - Orders, positions, backtesting results

### Data Flow & Timing
- **Real-time**: L1 snapshots, OHLCV (every few seconds)
- **Minute-level**: Mark prices, technical features
- **Hourly**: Open interest data
- **8-hourly**: Funding rates (00:00, 08:00, 16:00 UTC)
- **Daily**: Exchange specifications

## 📊 Table Reference

### Market Data Tables

#### `ohlcv_1m` - 1-minute candlestick data
```sql
- ts: timestamp (primary key with symbol)
- symbol: trading pair (e.g., 'BTCUSDT')  
- open/high/low/close: price data in USDT
- volume: base asset volume
- trades_count: number of trades in the minute
- vwap_minute: volume-weighted average price
```
**Collection**: Real-time from Binance spot API
**Latency**: ~1-3 seconds
**Use cases**: Price analysis, trend detection, volatility calculation

#### `l1_snapshots` - Order book top-of-book data
```sql
- ts: timestamp (primary key with symbol)
- symbol: trading pair
- bid_px/ask_px: best bid/ask prices  
- bid_qty/ask_qty: quantities at best prices
- spread: ask_px - bid_px (absolute)
- mid: (bid_px + ask_px) / 2
- spread_bps: spread in basis points (auto-calculated)
```
**Collection**: Real-time WebSocket feed
**Latency**: ~100-500ms
**Use cases**: Liquidity analysis, execution cost estimation, microstructure analysis

### Professional Trading Data

#### `funding_8h` - Futures funding rates
```sql
- symbol: futures contract (e.g., 'BTCUSDT')
- funding_time: UTC timestamp (00:00, 08:00, 16:00)
- funding_rate: rate as decimal (0.0001 = 0.01%)
- mark_price: mark price at funding time
```
**Collection**: Every 8 hours from Binance futures API
**Use cases**: Futures-spot arbitrage, sentiment analysis, carry trade strategies

#### `mark_prices` - Futures mark prices and premiums
```sql
- symbol: futures contract
- ts: timestamp (minute-level)
- mark_price: exchange mark price
- index_price: underlying index price  
- premium: mark_price - index_price
```
**Collection**: Every minute from Binance futures API
**Use cases**: Basis trading, futures pricing analysis, arbitrage detection

#### `open_interest` - Futures open interest
```sql
- symbol: futures contract
- ts: timestamp (hourly)
- open_interest: total outstanding contracts
- open_interest_value: USD value (can be null)
```
**Collection**: Hourly from Binance futures API
**Use cases**: Market sentiment, leverage analysis, position sizing

#### `exchange_specs` - Trading pair specifications
```sql
- symbol: trading pair
- tick_size: minimum price increment
- lot_size: minimum quantity increment  
- min_order_size/max_order_size: order size limits
- max_leverage: maximum allowed leverage
- maker_fee_bps/taker_fee_bps: trading fees in basis points
- risk_tiers: JSONB array of margin requirements
```
**Collection**: Daily or when specs change
**Use cases**: Order validation, risk management, fee calculation

### Technical Analysis Data

#### `features_1m` - Technical indicators (minute-level)
```sql
- ts: timestamp (primary key with symbol)
- symbol: trading pair
- roc_*: Rate of change over various periods (1m, 5m, 15m, 30m, 1h, 4h)
- vol_avg_20: 20-period volume moving average
- vol_mult: current volume / vol_avg_20
- rsi_14: 14-period RSI
- ema_*: Exponential moving averages (12, 26, 20, 50)
- macd/macd_signal: MACD and signal line
- bb_*: Bollinger Bands (basis, upper, lower)
- book_imb: Order book imbalance
- spread_bps: Bid-ask spread in basis points
```
**Collection**: Calculated from OHLCV and L1 data
**Use cases**: Signal generation, trend analysis, momentum strategies

### Trading System Data

#### `signals` - Generated trading signals
```sql
- ts: signal timestamp
- symbol: trading pair
- signal_type: signal category/strategy name
- direction: 'long', 'short', or 'close'
- strength: signal strength (0.0 to 1.0)
- metadata: JSONB with additional signal data
```

#### `orders` - Trading orders
```sql
- order_id: unique identifier
- symbol: trading pair
- side: 'buy' or 'sell'  
- order_type: 'market', 'limit', etc.
- quantity/price: order parameters
- status: 'pending', 'filled', 'cancelled', etc.
- timestamps: created_at, updated_at
```

#### `positions_snap` - Position snapshots
```sql
- ts: snapshot timestamp
- symbol: trading pair
- quantity: position size (positive = long, negative = short)
- avg_price: average entry price
- unrealized_pnl: mark-to-market P&L
- margin_used: collateral allocated
```

### Backtesting Data

#### `bt_runs` - Backtest run metadata
#### `bt_results` - Backtest performance metrics  
#### `bt_trades` - Individual backtest trades
#### `bt_equity` - Equity curve data

## 🔍 Key Relationships

### Data Dependencies
```
ohlcv_1m → features_1m (technical indicators calculated from OHLCV)
l1_snapshots → features_1m (spread_bps, book_imb)
features_1m → signals (signals generated from features)  
signals → orders (orders placed based on signals)
orders → positions_snap (positions updated from filled orders)
```

### Time Alignment
- All timestamps are in UTC
- Main data granularity is 1-minute
- Professional data has varying frequencies
- Use `ts` field consistently for time-based queries

## 🎯 What Your Agent Needs to Know

### Essential Knowledge (Must Have)
1. **Data Semantics**: What each field represents, units, typical ranges
2. **Collection Frequencies**: When data is updated, expected latency
3. **Data Quality**: Missing data patterns, calculation dependencies  
4. **Time Handling**: UTC timestamps, granularity differences
5. **Relationships**: How tables connect, data flow dependencies

### Business Logic Understanding (Should Have)
1. **Technical Indicators**: How features are calculated, interpretation
2. **Trading Mechanics**: Order types, position management, risk metrics
3. **Market Structure**: Spot vs futures, funding mechanics, basis
4. **Performance Metrics**: PnL calculation, drawdown, Sharpe ratio

### Implementation Details (Nice to Have)
1. **Collection Internals**: Rate limiting, API specifics, error handling
2. **Data Pipeline**: ETL processes, data validation, cleanup
3. **Infrastructure**: Database optimization, indexing strategies

## 🛠️ Recommended Agent Capabilities

### Data Analysis
```sql
-- Example: Get latest market summary
SELECT 
    symbol,
    close as last_price,
    (close - open) / open * 100 as pct_change,
    volume,
    trades_count
FROM ohlcv_1m 
WHERE ts = (SELECT MAX(ts) FROM ohlcv_1m)
ORDER BY volume DESC;
```

### Signal Monitoring
```sql
-- Example: Recent strong signals
SELECT * FROM signals 
WHERE ts >= NOW() - INTERVAL '1 hour'
  AND strength > 0.7
ORDER BY ts DESC;
```

### Performance Analysis
```sql
-- Example: Position summary
SELECT 
    symbol,
    quantity,
    avg_price,
    unrealized_pnl
FROM positions_snap
WHERE ts = (SELECT MAX(ts) FROM positions_snap)
  AND quantity != 0;
```

## 🚨 Important Considerations

### Data Integrity
- `spread_bps` in `l1_snapshots` is auto-calculated by trigger
- Technical features depend on sufficient historical OHLCV data
- Professional data may have gaps during maintenance windows

### Performance Tips
- Use time-based indexing for range queries
- Join tables carefully due to different update frequencies  
- Consider data retention policies for large tables

### Error Handling
- Handle missing data gracefully (nulls in professional data)
- Account for exchange downtime and data delays
- Validate calculations against source data when possible
