# Fake Trader System

## Overview

The Fake Trader is a **real-time paper trading system** that simulates live cryptocurrency trading using the same strategies as the backtester. It runs continuously, executing trades on real market data without risking actual capital.

### Latest Update: Dual-Timeframe Architecture (v2.0)

**Key Enhancement**: The system now operates on a sophisticated dual-timeframe approach:
- **Entry Signals**: Evaluated only when 15m candles complete (maintains strategy timeframe integrity)
- **Position Management**: Updated every minute with live prices (real-time risk management)
- **Execution Frequency**: Runs every 1 minute instead of every 15 minutes
- **Stop Loss/Take Profit**: Triggered immediately when live prices hit thresholds

This architecture provides the best of both worlds: responsive position management with sub-minute exit timing while preserving the 15m strategy logic for entry decisions.

## Purpose

- **Strategy Testing**: Test trading strategies in real-time market conditions
- **Live Simulation**: Experience live trading without financial risk  
- **Performance Validation**: Validate backtest results against live market behavior
- **Strategy Development**: Iterate and improve strategies with real-time feedback

## How It Works

### 1. **Automated Execution**
- **Cron Scheduling**: Runs every 1 minute using Node.js cron
- **15m Candle Detection**: Evaluates entry signals only when new 15m candles close
- **Live Price Updates**: Updates positions with real-time prices every minute
- **Strategy Execution**: Applies the same algorithms used in backtesting
- **Position Management**: Tracks open positions, P&L, and portfolio state

### 2. **Trading Cycle (Every 1 Minute)**
```
1. Fetch active trading runs from ft_runs table
2. Get live ticker prices for all symbols
3. Update existing position prices and unrealized P&L with live data
4. Check open positions for stop-loss/take-profit triggers
5. IF new 15m candle completed:
   - Get completed 15m candle data with technical indicators
   - Run strategy logic to generate entry signals
   - Execute new trades (open positions) if signals present
6. Update portfolio capital and position states
7. Log all decisions and actions to database
```

### 3. **Strategy Support**
All backtest strategies work in live mode:
- **Momentum Breakout (Basic)**: Simple momentum-based entries
- **Momentum Breakout V2 (Professional)**: Advanced momentum with risk management
- **Regime Filtered Momentum (Advanced)**: Market regime analysis with sophisticated filters

## Architecture

### Database Schema
```sql
ft_runs          -- Trading run configurations and status
ft_results       -- Performance metrics per symbol
ft_trades        -- Individual trade records
ft_positions     -- Current open positions
ft_signals       -- Strategy decision log (debugging)
ft_equity        -- Portfolio value over time
```

### Components

#### Worker Process (`fake-trader/src/index.ts`)
- **FakeTrader Class**: Main trading engine
- **Cron Scheduler**: 1-minute interval execution
- **Candle Detection**: Monitors for completed 15m candles
- **Strategy Engine**: Applies trading logic to completed candle data
- **Position Manager**: Tracks and updates positions with live prices
- **Risk Management**: Real-time stop-loss/take-profit monitoring
- **Error Handling**: Comprehensive error logging and recovery

#### Database Operations (`fake-trader/src/db.ts`)
- Connection management to PostgreSQL
- CRUD operations for all fake trading tables
- **Dual Data Sources**: `getCompleted15mCandles()` for entry signals, `getLivePrices()` for position updates
- **Candle Tracking**: `hasNew15mCandles()` and `updateLastProcessedCandle()` for completion detection
- Real-time data fetching and updates

#### Strategy Library (`fake-trader/src/strategies.ts`)
- Strategy implementations adapted for real-time execution
- Signal generation based on live market conditions
- Position sizing and risk management

### Web Interface

#### Main Page (`/fake-trader`)
- **Configuration Form**: Set up new trading runs
- **Active Runs Monitor**: Real-time status of running traders
- **Control Panel**: Start, pause, stop trading runs
- **Performance Summary**: Live P&L and capital tracking

#### Detail Page (`/fake-trader/[runId]`)
- **Capital Tracking**: Real-time portfolio performance
- **Open Positions**: Current positions with unrealized P&L
- **Trade History**: Completed trades with execution details
- **Run Controls**: Pause/resume/stop/exit/force-exit functionality

#### API Endpoints
```
POST   /api/fake-trader/create        -- Start new trading run
GET    /api/fake-trader/runs          -- List all runs
GET    /api/fake-trader/runs/[id]     -- Get run details
PATCH  /api/fake-trader/runs/[id]     -- Control run status or force exit
```

## Features

### Downtime Recovery
- **Automatic Detection**: Detects missed trading cycles on startup
- **Position Refresh**: Updates stale position prices with current market data
- **Gap Logging**: Records downtime events for audit trails
- **Seamless Resume**: Continues trading from exactly where it left off

### Real-Time Trading
- **Live Price Updates**: Position values updated every minute with live ticker data
- **Entry Signal Timing**: New positions only opened when 15m candles complete
- **Dual Data Sources**: Uses both completed 15m candles (entry) and live 1m prices (exits)
- **Real-Time Exits**: Stop-loss/take-profit triggers checked every minute
- **Position Tracking**: Real-time P&L and portfolio updates
- **Market Hours**: Operates 24/7 following crypto market schedule

### Risk Management
- **Paper Trading**: No real money at risk
- **Capital Limits**: Configurable starting capital and position limits
- **Position Sizing**: Automated position sizing based on strategy rules
- **Stop Loss/Take Profit**: Configurable risk management levels

### Comprehensive Logging
Every trading decision is logged to the database:
- **Signal Generation**: Why trades were/weren't taken
- **Market Context**: Complete candle data and indicators
- **Execution Details**: Trade prices, sizes, and outcomes
- **Error Tracking**: Failed executions and system errors
- **Performance Metrics**: Real-time portfolio analytics

### User Controls
- **Start/Stop**: Control when trading runs are active
- **Pause/Resume**: Temporarily halt trading without stopping
- **Exit Trade**: Graceful shutdown - stops new positions, closes existing ones naturally
- **Force Exit**: Emergency stop - immediately closes all positions at market price
- **Multi-Run**: Run multiple strategies simultaneously
- **Real-Time Monitoring**: 1-minute execution cycle provides near-instant position updates
- **Parameter Updates**: Modify strategy parameters (future feature)

## Configuration

### Strategy Parameters
Same parameters as backtesting:
- **Basic Strategies**: ROC thresholds, volume multipliers, spread limits
- **Advanced Strategies**: EMA periods, regime filters, risk percentages
- **Execution Settings**: Fees, slippage, leverage settings

### Risk Settings
- **Starting Capital**: $1,000 - $10,000,000
- **Max Concurrent Positions**: 1-10 positions
- **Position Sizing**: Based on capital percentage or fixed amounts
- **Timeframe**: 5m, 15m, 30m, 1h (15m recommended)

## Monitoring and Debugging

### Real-Time Monitoring
- **UI Dashboard**: Live updates every 5-10 seconds
- **Status Indicators**: Active, paused, stopped, error states
- **Performance Metrics**: Current capital, P&L, position count
- **Trade Notifications**: Real-time trade execution alerts

### Debug Information
The `ft_signals` table provides comprehensive debugging:
- **Strategy Decisions**: Why each signal was generated or rejected
- **Market Conditions**: Complete market context for each decision
- **Execution Flow**: Success/failure of trade executions
- **Error Analysis**: Detailed error messages and stack traces

### Log Analysis
```sql
-- View all signals for a run
SELECT * FROM ft_signals WHERE run_id = 'your-run-id' ORDER BY signal_ts DESC;

-- Check rejected signals (debugging why no trades)
SELECT symbol, rejection_reason, COUNT(*) 
FROM ft_signals 
WHERE run_id = 'your-run-id' AND executed = false 
GROUP BY symbol, rejection_reason;

-- Performance overview
SELECT symbol, COUNT(*) as signals, SUM(CASE WHEN executed THEN 1 ELSE 0 END) as executed
FROM ft_signals 
WHERE run_id = 'your-run-id' 
GROUP BY symbol;
```

## Getting Started

### 1. Setup Database
```bash
# Initial setup (for new installations)
psql your_database -f fake-trader/create-fake-trader-tables.sql

# Migration for existing installations (v2.0 update)
psql your_database -f fake-trader/add-last-processed-candle-column.sql
```

### 2. Install Dependencies
```bash
cd fake-trader
npm install
```

### 3. Start Worker (Production)
```bash
npm start
```

### 4. Development Mode
```bash
npm run dev
```

### 5. Web Interface
Navigate to `/fake-trader` in the web application to:
1. Configure a new trading run
2. Select symbols and strategy
3. Set capital and risk parameters
4. Start trading and monitor performance

## Use Cases

### Strategy Development
- **Rapid Iteration**: Test strategy changes in real-time
- **Market Validation**: Verify backtest results against live conditions
- **Parameter Tuning**: Optimize strategy parameters with live data

### Educational
- **Learning Tool**: Understand how strategies perform in real markets
- **Risk-Free Trading**: Experience live trading without financial consequences
- **Market Analysis**: Observe how different market conditions affect strategies

### Production Testing
- **Pre-Deployment**: Test strategies before committing real capital
- **Strategy Comparison**: Run multiple strategies simultaneously
- **Performance Benchmarking**: Compare against buy-and-hold or other benchmarks

## Limitations

- **Simulated Execution**: Does not account for order book depth or slippage complexity
- **Market Impact**: Does not consider how large orders would affect prices
- **Entry Timing**: New positions only opened when 15m candles complete (prevents sub-15m entries)
- **Data Dependency**: Relies on database market data quality and timeliness
- **Price Gaps**: Uses discrete 1-minute price updates rather than tick-by-tick data

## Future Enhancements

- **Real Broker Integration**: Connect to actual trading APIs for live execution
- **Advanced Order Types**: Limit orders, stop-loss automation
- **Portfolio Management**: Multi-strategy portfolio with correlation analysis
- **Performance Analytics**: Sharpe ratio, drawdown analysis, benchmark comparison
- **Alert System**: Email/SMS notifications for significant events
- **Strategy Marketplace**: Share and discover community strategies

## Implementation Details: Dual-Timeframe Architecture

### Data Flow Architecture

```
Every 1 Minute Cycle:
├── 1. Fetch Live Ticker Prices (ohlcv_1m) 
│   └── Update all open positions with current market values
├── 2. Check Exit Conditions
│   └── Trigger stop-loss/take-profit using live prices
├── 3. Check for New 15m Candles
│   └── Query: has new candle completed since last check?
└── 4. IF New 15m Candle Available:
    ├── Fetch Completed 15m Candle Data (ohlcv_15m + features_15m)
    ├── Run Strategy Logic for Entry Signals
    ├── Execute New Positions (at 15m candle close price)
    └── Update last_processed_candle timestamp
```

### Database Schema Updates

**New Columns:**
- `ft_runs.last_processed_candle`: Tracks last 15m candle processed for entry signals

**New Functions:**
- `getLivePrices()`: Real-time 1m ticker data for position updates
- `getCompleted15mCandles()`: 15m OHLCV + features for entry signal evaluation  
- `hasNew15mCandles()`: Detects when new 15m candles are available
- `updateLastProcessedCandle()`: Prevents duplicate signal processing

### Benefits of This Approach

1. **Strategy Integrity**: Entry signals use proper 15m timeframe data with completed technical indicators
2. **Responsive Risk Management**: Stop-losses and take-profits trigger within 1 minute of price movement
3. **Reduced False Signals**: No entry signals on incomplete/partial candles
4. **Optimal Execution**: Entries at 15m close, exits at live market prices
5. **Efficient Processing**: Only runs strategy logic when new data is available

## Technical Notes

- **Language**: TypeScript/Node.js
- **Database**: PostgreSQL with JSONB for flexible data storage
- **Scheduling**: node-cron for reliable 1-minute execution
- **Data Architecture**: Dual-timeframe approach (15m for entry, 1m for position management)
- **Candle Detection**: Timestamp-based completion tracking with database persistence
- **Error Recovery**: Comprehensive error handling with database logging
- **Scalability**: Designed to handle multiple concurrent trading runs
- **Monitoring**: Built-in health checks and status reporting

## Support

For issues, feature requests, or questions about the fake trader system, refer to the main project documentation or create an issue in the project repository.