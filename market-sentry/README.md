# Market Sentry: Hyperparameter Optimization for Momentum Trading

Advanced Bayesian optimization system for tuning momentum breakout trading strategies. This tool replicates your fake-trader's logic to find optimal parameters that maximize risk-adjusted returns while preventing overfitting.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd market-sentry
pip install -r requirements.txt
```

### 2. Export Historical Data
**Option A: Automated Export (Recommended)**
```bash
# Set your database credentials
export DATABASE_NAME="your_database"
export DATABASE_HOST="localhost"
export DATABASE_USER="your_username"
export SYMBOL="BTCUSDT"

# Run the export script (exports first 80% of your data for training)
./export_data.sh
```

**Option B: Manual Database Export**
Run the provided SQL query in your PostgreSQL database:
```sql
-- Connect to your database and run:
\i export_training_data.sql
```
This exports data from August 11 - September 16, 2024 (first 80% of your timeframe).

**Option C: Web-App Export (Alternative)**
From your web-app's backtest interface:
- Go to Backtest → Create New Backtest
- Set date range: August 11 - September 16, 2024
- Select symbols (BTCUSDT recommended)
- Timeframe: 1m (important for dual-timeframe backtesting)
- Click "📥 Download Candle Data"
- Save as `historical_data.csv` in this directory

### 3. Prepare Data
```bash
# Validate and prepare your data
python prepare_data.py historical_data.csv
```

### 4. Configure Optimization
Edit `config.yaml` to match your data and preferences:
```yaml
data:
  path: "historical_data.csv"  # Your exported data
  symbol: "BTCUSDT"            # Trading symbol

optimization:
  n_trials: 100               # Optimization trials (higher = better but slower)
  n_jobs: -1                  # CPU cores to use
```

### 5. Run Optimization
```bash
python run_optimization.py
```

### 6. Review Results
- **optimization_results.html**: Interactive visualization of parameter performance
- **optimization_results.json**: Detailed results and metrics
- **optimization.log**: Optimization progress and debug info

## 📊 How It Works

### Strategy Replication
The optimizer perfectly replicates your fake-trader's momentum breakout logic:
- **Dual-timeframe execution**: 15m candles for entries, 1m for position management
- **Entry conditions**: ROC threshold, volume multiplier, spread filter
- **Exit conditions**: Stop-loss (2%), take-profit (3%), momentum loss, RSI overbought
- **Risk management**: Configurable leverage and position sizing

### Bayesian Optimization
Instead of testing every parameter combination (grid search), we use intelligent sampling:
- **Efficient**: Finds optimal parameters with 50-200 trials vs. thousands for grid search
- **Adaptive**: Learns from previous trials to focus on promising parameter regions
- **Robust**: Includes walk-forward validation to prevent overfitting

### Multi-Objective Optimization
Balances multiple performance metrics:
- **Sharpe Ratio (50%)**: Risk-adjusted returns (primary objective)
- **Win Rate (30%)**: Trade success percentage
- **Total PnL (20%)**: Absolute profitability
- **Drawdown Penalty**: Reduces score for strategies with high volatility

## 🎯 Parameter Optimization

The system optimizes these key parameters:

| Parameter | Range | Description |
|-----------|-------|-------------|
| `minRoc5m` | 0.1% - 3.0% | Minimum momentum threshold for entry |
| `minVolMult` | 1.0x - 5.0x | Minimum volume multiplier vs. average |
| `maxSpreadBps` | 1-20 bps | Maximum bid-ask spread filter |
| `leverage` | 1x - 20x | Position leverage multiplier |
| `riskPct` | 5% - 50% | Risk percentage per trade |
| `timeframe` | 5m, 15m | ROC calculation timeframe |

## 📈 Performance Validation

### Walk-Forward Validation
Prevents overfitting by testing parameters on out-of-sample data:
- Splits historical data into multiple periods
- Optimizes on training data, validates on unseen data
- Ensures parameters work across different market conditions

### Robustness Metrics
- **Consistency**: Low variance in performance across validation periods
- **Sharpe > 0.5**: Decent risk-adjusted returns
- **Win Rate > 55%**: Profitable trade frequency
- **Max DD < 15%**: Controlled drawdown

## 🛠️ Configuration Options

### Data Format Requirements
Your CSV should contain these columns:
```csv
timestamp,open,high,low,close,volume,roc_1m,roc_5m,roc_15m,rsi_14,vol_mult,spread_bps,...
```

### Advanced Configuration
```yaml
# Increase trials for thorough optimization
optimization:
  n_trials: 200
  timeout: 7200  # 2-hour timeout

# Adjust parameter bounds for your strategy
parameters:
  minRoc5m:
    min: 0.5   # More conservative
    max: 5.0   # More aggressive

# Customize objective weights
objective_weights:
  sharpe_ratio: 0.6     # More emphasis on risk-adjusted returns
  win_rate: 0.2
  pnl: 0.2
```

## 📊 Interpreting Results

### Best Parameters Output
```json
{
  "best_params": {
    "minRoc5m": 0.8,
    "minVolMult": 2.5,
    "maxSpreadBps": 6,
    "leverage": 15,
    "riskPct": 25.0,
    "timeframe": "5m"
  },
  "best_objective": 1.234
}
```

### Performance Metrics
- **PnL**: Total profit/loss in dollars
- **Win Rate**: Percentage of profitable trades
- **Sharpe Ratio**: Risk-adjusted returns (higher = better)
- **Max Drawdown**: Largest peak-to-trough decline
- **Profit Factor**: Gross profit / gross loss ratio

### Walk-Forward Validation
- **Robust**: Parameters work consistently across time periods
- **Overfitted**: Great in-sample, poor out-of-sample performance

## 🚀 Deploying to Fake-Trader

Once you have optimized parameters:

1. **Copy parameters** to your fake-trader configuration
2. **Update strategy params** in the web-app interface
3. **Start paper trading** to validate real-time performance
4. **Monitor closely** for the first few days
5. **Iterate** if needed based on live market conditions

## 🔧 Troubleshooting

### Common Issues

**"Data file not found"**
- Export data from web-app backtest interface
- Ensure CSV is in the market-sentry directory
- Check filename matches config.yaml

**"Missing required columns"**
- Ensure your data export includes all technical indicators
- Check column names match expected format

**"Optimization taking too long"**
- Reduce `n_trials` in config.yaml
- Increase `n_jobs` for parallel processing
- Set `timeout` to limit runtime

**"Poor validation performance"**
- Your data may be too short (< 30 days)
- Market conditions may have changed
- Try different parameter bounds
- Consider walk-forward optimization

### Performance Tips

- **Use recent data**: Last 30-90 days for relevance
- **Multiple symbols**: Test on 2-3 major pairs for robustness
- **Parallel processing**: Set `n_jobs: -1` to use all CPU cores
- **Resume optimization**: Results are saved, can restart if interrupted

## 📚 Advanced Usage

### Custom Objective Function
Modify the `objective_function` in `hyperparameter_optimizer.py` to customize optimization goals.

### Additional Parameters
Add new parameters to optimize by extending the `params` dictionary in the objective function.

### Custom Validation
Implement custom validation logic in the `walk_forward_validation` method.

## 🤝 Integration with Your System

### Web-App Integration
The optimizer is designed to work seamlessly with your existing infrastructure:
- Uses same data format as your backtest exports
- Replicates fake-trader strategy logic exactly
- Outputs parameters ready for fake-trader deployment

### API Integration (Future)
Consider adding REST API endpoints to your web-app for:
- Triggering optimization runs
- Retrieving optimization results
- Automated parameter deployment

## 📄 License & Support

This tool is part of your momentum trading system. For issues or enhancements, refer to your main project documentation.

---

**Remember**: Always validate optimized parameters in paper trading before risking real capital. Past performance does not guarantee future results.
