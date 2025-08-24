# Real Trader

Real trading application for live Binance Futures trading using momentum strategies.

## ⚠️ IMPORTANT SAFETY NOTICE

**THIS APPLICATION TRADES WITH REAL MONEY ON BINANCE FUTURES**

- Always start with **TESTNET ONLY**
- Test thoroughly before considering mainnet
- Use small amounts and proper risk management
- Monitor your trades actively
- This is experimental software - use at your own risk

## Features

- 🚀 **Live Trading**: Executes real trades on Binance Futures
- 📊 **Strategy Support**: Uses the same strategies as backtest-worker and fake-trader
- 🛡️ **Risk Management**: Built-in daily loss limits, drawdown protection, position size limits
- 🔄 **Position Sync**: Automatically syncs with existing Binance positions
- 📈 **Real-time Monitoring**: Updates positions with live market prices
- 💾 **Full Logging**: Comprehensive database logging of all signals and trades
- ⏱️ **15m Strategy Execution**: Evaluates entries on completed 15m candles
- 🔐 **Testnet Support**: Safe testing environment

## Architecture

The real-trader follows the same patterns as fake-trader but integrates with Binance:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Database      │    │   Real Trader   │    │   Binance API   │
│                 │    │                 │    │                 │
│ • rt_runs       │◄──►│ • Strategy Exec │◄──►│ • Live Trading  │
│ • rt_positions  │    │ • Risk Mgmt     │    │ • Market Data   │
│ • rt_trades     │    │ • Position Sync │    │ • Account Info  │
│ • rt_signals    │    │ • Monitoring    │    │ • Order Mgmt    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

1. **Database**: PostgreSQL with existing OHLCV and features data
2. **Binance Account**: Futures trading enabled
3. **API Keys**: Binance testnet API credentials

## Setup

1. **Install dependencies:**
   ```bash
   cd real-trader
   npm install
   ```

2. **Create database tables:**
   ```sql
   \i create-real-trader-tables.sql
   ```

3. **Environment configuration:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Get Binance Testnet API Keys:**
   - Go to https://testnet.binancefuture.com/
   - Create account and generate API keys
   - Enable futures trading permissions

5. **Configure environment:**
   ```env
   DATABASE_URL=postgresql://user:pass@localhost:5432/database
   BINANCE_API_KEY=your_testnet_api_key
   BINANCE_API_SECRET=your_testnet_secret_key
   BINANCE_TESTNET=true
   ```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Testing Connection
```bash
npm run test
```

## Configuration

### Risk Management Settings

Each trading run supports these risk management parameters:

- `daily_loss_limit_pct`: Maximum daily loss percentage (default: 5%)
- `max_drawdown_pct`: Maximum total drawdown (default: 10%)
- `max_position_size_usd`: Maximum position size in USD (default: $1000)
- `max_concurrent_positions`: Maximum open positions (default: 3)

### Strategy Parameters

Supports all strategies from backtest-worker/fake-trader:
- `momentum_breakout`
- `momentum_breakout_v2` 
- `regime_filtered_momentum`

## Database Schema

### Core Tables
- `rt_runs`: Trading runs configuration
- `rt_positions`: Current open positions
- `rt_trades`: Individual trade records  
- `rt_signals`: Strategy signal logs
- `rt_daily_summary`: Daily risk tracking

### Key Features
- **Position Sync**: Automatically syncs with Binance positions
- **Comprehensive Logging**: Every signal and trade is logged
- **Risk Tracking**: Daily P&L and drawdown monitoring
- **Recovery Support**: Handles system downtime gracefully

## Safety Features

### Automatic Risk Management
- Daily loss limit enforcement
- Maximum drawdown protection  
- Position size limits
- Minimum balance requirements

### Position Synchronization
- Syncs database positions with Binance
- Detects and handles position discrepancies
- Recovers gracefully from downtime

### Comprehensive Logging
- All signals logged (executed and rejected)
- Binance API responses stored
- Error tracking and reporting
- Trade execution details

## Monitoring

The trader logs detailed information:

```
🚀 Starting Real Trader...
📊 Mode: TESTNET
✓ Database connected successfully  
✓ Binance Testnet connected successfully
💰 Account Balance: $10000.00
💵 Available Balance: $9500.00

🔄 [2024-01-01T12:00:00.000Z] Executing trading cycle...
📈 Processing 1 active trading runs

🎯 Processing run: My Test Strategy
   Strategy: momentum_breakout_v2
   Symbols: BTCUSDT, ETHUSDT
   Capital: $10000
   Mode: TESTNET
   
   📊 New 15m candle(s) available - evaluating entry signals
   
  📊 Evaluating entry signals for BTCUSDT @ $45000 (15m candle: 2024-01-01T12:15:00.000Z)
[BTCUSDT] 🚀 ENTRY SIGNAL: roc5m=1.5%, volMult=4.2x, spread=5bps
     🎯 Entry Signal: LONG 0.0444 BTCUSDT @ $45000 (momentum_breakout_v2)
     ✅ Opened LONG position: abc123... (Binance ID: 12345678)
```

## API Integration

### Binance Futures API Features
- **Market Orders**: Instant execution at market price
- **Position Management**: Full LONG/SHORT position support
- **Risk Management**: Leverage control, margin type settings
- **Real-time Data**: Live price feeds for position updates
- **Order Management**: Stop-loss and take-profit orders

### Error Handling
- API rate limit management
- Connection retry logic
- Comprehensive error logging
- Graceful degradation

## Development

### Project Structure
```
real-trader/
├── src/
│   ├── index.ts           # Main trading engine
│   ├── binanceClient.ts   # Binance API integration  
│   ├── db.ts              # Database operations
│   ├── strategies.ts      # Trading strategies
│   └── types.ts           # TypeScript types
├── create-real-trader-tables.sql
├── package.json
├── tsconfig.json
└── README.md
```

### Adding New Strategies

1. Add strategy function to `strategies.ts`
2. Register in `getStrategy()` function
3. Test with fake-trader first
4. Deploy to real-trader testnet

### Testing

Always test new strategies in this order:
1. **Backtest-worker**: Historical simulation
2. **Fake-trader**: Live simulation with fake money  
3. **Real-trader testnet**: Live trading with test money
4. **Real-trader mainnet**: Live trading with real money (if desired)

## Important Notes

### Testnet vs Mainnet

- **ALWAYS start with testnet**
- Testnet uses fake money but real market data
- Test all strategies thoroughly before considering mainnet
- Testnet API endpoints are different from mainnet

### Position Sizing

- Position sizes are calculated in USD and converted to base asset quantity
- Minimum order sizes are enforced by Binance
- Step size requirements are automatically handled

### Risk Management

- Risk limits are checked before every trade
- Runs are automatically paused if limits are exceeded
- Daily P&L tracking prevents overexposure
- Maximum drawdown protection preserves capital

### Data Requirements

- Requires OHLCV 1-minute data for position updates
- Requires features_1m data for strategy signals
- Aggregates 1m data into 15m candles for strategy execution

## Troubleshooting

### Common Issues

1. **API Connection Errors**
   - Verify API keys are correct
   - Check testnet vs mainnet configuration
   - Ensure futures trading is enabled

2. **Database Errors**  
   - Verify DATABASE_URL is correct
   - Check if rt_* tables exist
   - Ensure database has required data

3. **Order Execution Errors**
   - Check minimum order sizes
   - Verify account balance
   - Check symbol trading status

4. **Position Sync Issues**
   - Review position synchronization logs
   - Check for manual trades outside the bot
   - Verify position side configuration

### Logs and Debugging

Enable detailed logging by setting:
```env
LOG_LEVEL=debug
```

Check database for detailed signal logs:
```sql
SELECT * FROM rt_signals WHERE run_id = 'your-run-id' ORDER BY created_at DESC;
```

## Security

- **Never commit API keys to version control**
- Use environment variables for all secrets
- Keep testnet and mainnet keys separate
- Monitor API key permissions regularly
- Use IP restrictions when possible

## Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.**

Trading cryptocurrency futures involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results. Only trade with money you can afford to lose.

The developers are not responsible for any losses incurred through the use of this software.