# Backtest Worker

This is the background worker that processes backtest jobs created from the web application.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database connection
   ```

3. **Run the worker:**
   ```bash
   npm run dev  # Development mode with auto-restart
   # or
   npm run build && npm start  # Production mode
   ```

## Configuration

Key environment variables in `.env`:

- `DATABASE_URL` - PostgreSQL connection string (required)
- `WORKER_NAME` - Unique worker identifier (default: 'worker')
- `POLL_MS` - How often to check for jobs in milliseconds (default: 1500)
- `MAX_PARALLEL_SYMBOLS` - Max symbols to process concurrently per backtest (default: 2)

## How It Works

1. **Job Polling**: Worker polls the `bt_runs` table for jobs with status 'queued'
2. **Job Claiming**: Uses `FOR UPDATE SKIP LOCKED` to atomically claim jobs
3. **Data Loading**: Loads OHLCV + technical indicators for each symbol
4. **Strategy Execution**: Runs the specified strategy (momentum_breakout, momentum_breakout_v2)
5. **Results Storage**: Writes results to `bt_results` table
6. **Status Updates**: Updates job status to 'done' or 'error'

## Strategies

### momentum_breakout
- Basic momentum breakout strategy
- Uses 5-minute ROC, volume multiplier, and spread filters
- Simple long-only positions with risk management

### momentum_breakout_v2  
- Enhanced version with professional trading features
- Advanced risk management and position sizing
- Support for dynamic exchange specifications

## User Parameters

The worker now correctly uses parameters from the backtest form:

- **Execution Parameters**: feeBps, slippageBps, leverage
- **Starting Capital**: Custom dollar amount (default: $10,000) 
- **Strategy Parameters**: minRoc5m, minVolMult, maxSpreadBps
- **Seed**: For reproducible results

## Debugging

The worker provides detailed logging:

- ✅ Database connection test on startup
- 📊 Job details when processing starts
- ⚡ Per-symbol completion progress
- 🎉 Job completion with timing
- ❌ Detailed error messages with context

## Database Requirements

Required tables:
- `bt_runs` - Backtest job queue
- `bt_results` - Results storage  
- `ohlcv_1m` - 1-minute OHLCV data
- `features_1m` - Technical indicators

Optional professional trading tables:
- `funding_8h` - Funding rates
- `mark_prices` - Mark prices
- `l1_snapshots` - Order book snapshots
- `exchange_specs` - Trading specifications

## Troubleshooting

**Worker not picking up jobs?**
- Check database connection
- Verify `bt_runs` table has 'queued' jobs
- Check worker logs for errors

**Jobs failing immediately?**
- Check if OHLCV data exists for symbols/date range
- Verify `features_1m` table has required indicators
- Check error column in `bt_runs` table

**Results showing $0/NaN values?**
- Check that execution parameters are being passed correctly
- Verify starting capital is set in form  
- Check database for actual results data

## Development

```bash
npm run test        # Run test suite
npm run typecheck   # Type checking
npm run build       # Build for production
```