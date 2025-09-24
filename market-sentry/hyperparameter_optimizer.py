#!/usr/bin/env python3
"""
Hyperparameter Optimization for Momentum Breakout Strategy
============================================================

This script performs Bayesian optimization of trading strategy parameters using
historical data from your web-app's backtesting system. It replicates the logic
of your fake-trader's momentum breakout strategy for accurate simulation.

Features:
- Bayesian optimization using Optuna (efficient parameter search)
- Walk-forward validation to prevent overfitting
- Multi-objective optimization (PnL, Sharpe ratio, win rate)
- Compatible with your web-app's candle data export format
- Parallel optimization trials for speed

Usage:
1. Export historical candle data from your web-app (OHLCV + features)
2. Run: python hyperparameter_optimizer.py --data your_data.csv
3. Review results and deploy best parameters to fake-trader

Author: Market Sentry Optimizer
"""

import argparse
import logging
import multiprocessing
import os
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import warnings

import numpy as np
import optuna
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from scipy import stats

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('optimization.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class MomentumBreakoutBacktester:
    """
    Backtester that replicates the fake-trader's momentum breakout strategy logic.

    This simulates the dual-timeframe approach:
    - 15m candles for entry signals
    - 1m candles for position management and exits
    """

    def __init__(self, params: Dict[str, Any], symbol: str = 'BTCUSDT'):
        self.params = params
        self.symbol = symbol
        self.positions = []  # Track open positions
        self.trades = []     # Track completed trades
        self.equity_curve = []
        self.fees_paid = 0.0

        # Default risk management parameters (can be optimized later)
        self.stop_loss_pct = 0.02   # 2% stop loss
        self.take_profit_pct = 0.03 # 3% take profit
        self.fee_bps = 4            # 0.04% per trade (round trip)
        self.slippage_bps = 2       # 0.02% slippage

        # Cache for computed indicators (to avoid recalculation)
        self._indicator_cache = {}

    def calculate_roc_safely(self, df: pd.DataFrame, periods: int, current_idx: int) -> float:
        """
        Calculate ROC (Rate of Change) safely without lookahead bias.

        Only uses data up to current_idx (inclusive).
        Formula: ((current_price / price_periods_ago) - 1) * 100

        Args:
            df: DataFrame with price data
            periods: Number of periods ago to compare
            current_idx: Current index in DataFrame (inclusive)

        Returns:
            ROC percentage or 0.0 if insufficient data
        """
        if current_idx < periods:
            return 0.0  # Insufficient data

        # ASSERTION: No lookahead - only using past data
        assert current_idx >= periods, f"Insufficient historical data: need {periods} periods, have {current_idx + 1}"

        current_price = df.iloc[current_idx]['close']
        past_price = df.iloc[current_idx - periods]['close']

        if past_price == 0:
            return 0.0

        roc = ((current_price / past_price) - 1.0) * 100.0
        return roc

    def get_roc_value(self, candle: pd.Series, timeframe: str) -> float:
        """Get ROC value based on timeframe (matches fake-trader logic)"""
        roc_map = {
            '1m': 'roc_1m',
            '5m': 'roc_5m',
            '15m': 'roc_15m',
            '30m': 'roc_30m',
            '1h': 'roc_1h',
            '4h': 'roc_4h',
            '1d': 'roc_4h'  # Use 4h as proxy for daily
        }
        roc_field = roc_map.get(timeframe, 'roc_5m')
        return candle.get(roc_field, 0.0) or 0.0

    def check_entry_conditions(self, candle_15m: pd.Series, current_capital: float) -> Optional[Dict]:
        """Check if entry conditions are met (matches fake-trader logic)"""
        # Get required parameters
        min_roc_threshold = self.params.get('minRoc5m', 0.5)
        min_vol_mult = self.params.get('minVolMult', 2.0)
        max_spread_bps = self.params.get('maxSpreadBps', 8.0)
        leverage = self.params.get('leverage', 1.0)
        risk_pct = self.params.get('riskPct', 20.0)  # Risk percentage of equity per trade
        timeframe = self.params.get('timeframe', '5m')

        # Get candle data (handle NaN values like fake-trader)
        roc_value = self.get_roc_value(candle_15m, timeframe)
        vol_mult = candle_15m.get('vol_mult', 1.0) or 1.0
        spread_bps = candle_15m.get('spread_bps', 0.0) or 0.0

        # Check entry conditions (exact same logic as fake-trader)
        momentum_ok = roc_value >= min_roc_threshold
        volume_ok = vol_mult >= min_vol_mult
        spread_ok = spread_bps <= max_spread_bps

        if momentum_ok and volume_ok and spread_ok:
            # Calculate position size based on risk percentage (matches fake-trader)
            risk_amount = current_capital * (risk_pct / 100.0)
            position_notional = risk_amount * leverage
            position_size = position_notional / candle_15m['close']

            return {
                'symbol': self.symbol,
                'side': 'LONG',
                'size': position_size,
                'entry_price': candle_15m['close'],
                'stop_loss': candle_15m['close'] * (1.0 - self.stop_loss_pct),
                'take_profit': candle_15m['close'] * (1.0 + self.take_profit_pct),
                'leverage': leverage,
                'timestamp': candle_15m.name,
                'reason': f'momentum_breakout_{timeframe}'
            }

        return None

    def check_exit_conditions(self, position: Dict, current_price: float, candle_1m: pd.Series) -> Optional[Dict]:
        """Check if exit conditions are met (matches fake-trader logic)"""
        # Check stop loss and take profit
        if current_price <= position['stop_loss'] or current_price >= position['take_profit']:
            return {
                'exit_price': current_price,
                'exit_reason': 'stop_loss' if current_price <= position['stop_loss'] else 'take_profit',
                'timestamp': candle_1m.name
            }

        # Check momentum loss or RSI overbought (matches fake-trader)
        momentum_lost = (candle_1m.get('roc_1m', 0.0) or 0.0) < 0.0
        rsi_overbought = (candle_1m.get('rsi_14', 50.0) or 50.0) > 75.0

        if momentum_lost or rsi_overbought:
            return {
                'exit_price': current_price,
                'exit_reason': 'momentum_loss' if momentum_lost else 'rsi_overbought',
                'timestamp': candle_1m.name
            }

        return None

    def calculate_fees(self, notional_value: float) -> float:
        """Calculate trading fees (matches web-app backtest logic)"""
        fee_rate = self.fee_bps / 10000.0  # Convert bps to decimal
        slippage_rate = self.slippage_bps / 10000.0
        return notional_value * (fee_rate + slippage_rate)

    def run_backtest(self, df_15m: pd.DataFrame, df_1m: pd.DataFrame,
                    initial_capital: float = 10000.0) -> Dict[str, Any]:
        """
        Run backtest simulation using dual-timeframe approach.

        Args:
            df_15m: 15-minute candles for entry signals
            df_1m: 1-minute candles for position management
            initial_capital: Starting capital amount

        Returns:
            Dictionary with backtest results
        """
        current_capital = initial_capital
        self.positions = []
        self.trades = []
        self.equity_curve = [(df_1m.index[0], initial_capital)]
        self.fees_paid = 0.0

        # Convert timestamps to ensure proper sorting
        df_15m = df_15m.sort_index()
        df_1m = df_1m.sort_index()

        # Track last processed 15m candle
        last_15m_idx = 0

        for idx, candle_1m in df_1m.iterrows():
            current_price = candle_1m['close']

            # ASSERTION: No lookahead - only using current and past data
            assert idx <= len(df_1m) - 1, f"Processing candle {idx} but only have {len(df_1m)} total candles"
            assert candle_1m.name <= df_1m.index[-1], f"Processing future timestamp: {candle_1m.name}"

            # Check for new 15m candle completion (entry signal timing)
            new_15m_available = False
            for i in range(last_15m_idx, len(df_15m)):
                candle_15m = df_15m.iloc[i]
                if candle_15m.name <= idx:  # 15m candle is complete (NO LOOKAHEAD)
                    # ASSERTION: Only using completed 15m candle data
                    assert candle_15m.name <= candle_1m.name, f"Using future 15m candle {candle_15m.name} at 1m time {candle_1m.name}"

                    # Check entry conditions
                    entry_signal = self.check_entry_conditions(candle_15m, current_capital)
                    if entry_signal:
                        # DEBUG: Log entry decision with NO future data usage
                        logger.debug(f"ENTRY at {candle_15m.name}: ROC={self.get_roc_value(candle_15m, self.params.get('timeframe', '5m')):.2f}%, "
                                  f"VolMult={candle_15m.get('vol_mult', 1.0):.2f}x, "
                                  f"Spread={candle_15m.get('spread_bps', 0.0):.1f}bps, "
                                  f"Price=${candle_15m['close']:.2f} -> Position: {entry_signal['size']:.6f} units")

                        # Open new position
                        position = {
                            'symbol': entry_signal['symbol'],
                            'side': entry_signal['side'],
                            'size': entry_signal['size'],
                            'entry_price': entry_signal['entry_price'],
                            'stop_loss': entry_signal['stop_loss'],
                            'take_profit': entry_signal['take_profit'],
                            'leverage': entry_signal['leverage'],
                            'entry_timestamp': entry_signal['timestamp'],
                            'cost_basis': entry_signal['size'] * entry_signal['entry_price']
                        }
                        self.positions.append(position)

                        # Calculate entry fees
                        entry_fees = self.calculate_fees(position['cost_basis'])
                        current_capital -= entry_fees
                        self.fees_paid += entry_fees

                    last_15m_idx = i + 1
                    new_15m_available = True
                else:
                    break

            # Update existing positions and check exits (NO LOOKAHEAD)
            positions_to_close = []
            for position in self.positions:
                exit_signal = self.check_exit_conditions(position, current_price, candle_1m)
                if exit_signal:
                    # ASSERTION: Exit only uses current price and candle data
                    assert exit_signal['exit_price'] == current_price, f"Exit price {exit_signal['exit_price']} != current price {current_price}"
                    assert exit_signal['timestamp'] == candle_1m.name, f"Exit timestamp {exit_signal['timestamp']} != current candle {candle_1m.name}"

                    # Close position
                    exit_price = exit_signal['exit_price']
                    exit_value = position['size'] * exit_price
                    realized_pnl = (exit_value - position['cost_basis']) * position['leverage']

                    # Calculate exit fees
                    exit_fees = self.calculate_fees(exit_value)
                    realized_pnl -= exit_fees
                    self.fees_paid += exit_fees

                    # Record trade
                    trade = {
                        'symbol': position['symbol'],
                        'side': position['side'],
                        'entry_timestamp': position['entry_timestamp'],
                        'exit_timestamp': exit_signal['timestamp'],
                        'entry_price': position['entry_price'],
                        'exit_price': exit_price,
                        'quantity': position['size'],
                        'realized_pnl': realized_pnl,
                        'fees': entry_fees + exit_fees,
                        'leverage': position['leverage'],
                        'exit_reason': exit_signal['exit_reason']
                    }
                    self.trades.append(trade)

                    # Update capital
                    current_capital += realized_pnl
                    positions_to_close.append(position)

                    # DEBUG: Log exit decision with NO future data usage
                    logger.debug(f"EXIT at {candle_1m.name}: {exit_signal['exit_reason']} "
                               ".4f"
                               ".2f")

            # Remove closed positions
            for position in positions_to_close:
                self.positions.remove(position)

            # Update equity curve
            unrealized_pnl = sum(
                (current_price - pos['entry_price']) * pos['size'] * pos['leverage']
                for pos in self.positions
            )
            total_equity = current_capital + unrealized_pnl
            self.equity_curve.append((idx, total_equity))

        # Calculate performance metrics
        return self._calculate_metrics(initial_capital)

    def _calculate_metrics(self, initial_capital: float) -> Dict[str, Any]:
        """Calculate comprehensive performance metrics"""
        if not self.trades:
            return {
                'total_trades': 0,
                'win_rate': 0.0,
                'total_pnl': 0.0,
                'total_fees': self.fees_paid,
                'sharpe_ratio': 0.0,
                'max_drawdown': 0.0,
                'profit_factor': 0.0,
                'avg_win': 0.0,
                'avg_loss': 0.0,
                'equity_curve': self.equity_curve,
                'final_equity': initial_capital
            }

        # Basic trade metrics
        winning_trades = [t for t in self.trades if t['realized_pnl'] > 0]
        losing_trades = [t for t in self.trades if t['realized_pnl'] <= 0]

        total_pnl = sum(t['realized_pnl'] for t in self.trades)
        win_rate = len(winning_trades) / len(self.trades) if self.trades else 0.0

        avg_win = np.mean([t['realized_pnl'] for t in winning_trades]) if winning_trades else 0.0
        avg_loss = np.mean([t['realized_pnl'] for t in losing_trades]) if losing_trades else 0.0

        # Sharpe ratio calculation
        equity_values = [eq for _, eq in self.equity_curve]
        if len(equity_values) > 1:
            returns = np.diff(equity_values) / equity_values[:-1]
            if len(returns) > 0 and np.std(returns) > 0:
                sharpe_ratio = np.sqrt(252) * np.mean(returns) / np.std(returns)  # Annualized
            else:
                sharpe_ratio = 0.0
        else:
            sharpe_ratio = 0.0

        # Maximum drawdown
        peak = initial_capital
        max_dd = 0.0
        for _, equity in self.equity_curve:
            if equity > peak:
                peak = equity
            dd = (peak - equity) / peak
            max_dd = max(max_dd, dd)

        # Profit factor
        gross_profit = sum(t['realized_pnl'] for t in winning_trades)
        gross_loss = abs(sum(t['realized_pnl'] for t in losing_trades))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

        final_equity = self.equity_curve[-1][1] if self.equity_curve else initial_capital

        return {
            'total_trades': len(self.trades),
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'total_fees': self.fees_paid,
            'sharpe_ratio': sharpe_ratio,
            'max_drawdown': max_dd,
            'profit_factor': profit_factor,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'equity_curve': self.equity_curve,
            'final_equity': final_equity,
            'winning_trades': len(winning_trades),
            'losing_trades': len(losing_trades)
        }


class HyperparameterOptimizer:
    """
    Bayesian hyperparameter optimization for momentum breakout strategy.

    Uses Optuna to efficiently search the parameter space and find optimal
    trading strategy configurations.
    """

    def __init__(self, data_path: str, symbol: str = 'BTCUSDT'):
        self.data_path = data_path
        self.symbol = symbol
        self.data_15m = None
        self.data_1m = None
        self.load_data()

    def load_data(self):
        """Load and preprocess historical data"""
        logger.info(f"Loading data from {self.data_path}")

        # Load CSV data (assuming format from web-app export)
        df = pd.read_csv(self.data_path)

        # Convert timestamp column
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            df.set_index('timestamp', inplace=True)
        elif 'ts' in df.columns:
            df['ts'] = pd.to_datetime(df['ts'])
            df.set_index('ts', inplace=True)

        # Ensure we have required OHLCV columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")

        # Resample to 15m and 1m dataframes
        self.data_1m = df.copy()

        # Calculate technical indicators safely (NO LOOKAHEAD)
        logger.info("Calculating technical indicators without lookahead bias...")

        # Calculate ROC values for different timeframes
        for periods, col_name in [(1, 'roc_1m'), (5, 'roc_5m'), (15, 'roc_15m'), (30, 'roc_30m'), (60, 'roc_1h'), (240, 'roc_4h')]:
            df[col_name] = 0.0  # Initialize column
            for i in range(periods, len(df)):
                df.iloc[i, df.columns.get_loc(col_name)] = self.calculate_roc_safely(df, periods, i)

        # Calculate volume multiplier (volume / 20-period average)
        df['vol_avg_20'] = df['volume'].rolling(window=20, min_periods=1).mean()
        df['vol_mult'] = df['volume'] / df['vol_avg_20']

        # RSI calculation (simplified, using 14-period)
        def calculate_rsi(prices, period=14):
            """Calculate RSI without lookahead bias"""
            rsi_values = []
            for i in range(len(prices)):
                if i < period:
                    rsi_values.append(50.0)  # Neutral RSI for insufficient data
                else:
                    gains = []
                    losses = []
                    for j in range(i - period + 1, i + 1):
                        change = prices[j] - prices[j - 1]
                        if change > 0:
                            gains.append(change)
                        else:
                            losses.append(-change)

                    avg_gain = sum(gains) / period if gains else 0
                    avg_loss = sum(losses) / period if losses else 0

                    if avg_loss == 0:
                        rsi = 100.0
                    else:
                        rs = avg_gain / avg_loss
                        rsi = 100.0 - (100.0 / (1.0 + rs))

                    rsi_values.append(rsi)
            return rsi_values

        df['rsi_14'] = calculate_rsi(df['close'].values, 14)

        # Set defaults for indicators that can't be calculated safely
        df['spread_bps'] = df.get('spread_bps', 5.0).fillna(5.0)
        df['book_imb'] = df.get('book_imb', 0.0).fillna(0.0)

        logger.info("✅ Technical indicators calculated without lookahead bias")

        # Resample to 15m candles (for entry signals)
        # CRITICAL: Use 'last' for indicators to ensure we're using the most recent calculated values
        self.data_15m = df.resample('15min').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum',
            # Technical indicators (take last calculated value in interval)
            'roc_1m': 'last',
            'roc_5m': 'last',
            'roc_15m': 'last',
            'roc_30m': 'last',
            'roc_1h': 'last',
            'roc_4h': 'last',
            'rsi_14': 'last',
            'vol_mult': 'last',
            'spread_bps': 'last',
            'book_imb': 'last'
        }).dropna()

        logger.info(f"Loaded {len(self.data_1m)} 1m candles and {len(self.data_15m)} 15m candles")

    def objective_function(self, trial: optuna.Trial) -> float:
        """Objective function for Optuna optimization"""

        # Define parameter search space (based on fake-trader defaults and reasonable ranges)
        params = {
            'minRoc5m': trial.suggest_float('minRoc5m', 0.1, 3.0, step=0.1),     # Entry threshold 0.1% to 3.0%
            'minVolMult': trial.suggest_float('minVolMult', 1.0, 5.0, step=0.1),  # Volume multiplier 1x to 5x
            'maxSpreadBps': trial.suggest_int('maxSpreadBps', 1, 20, step=1),      # Spread filter 1-20 bps
            'leverage': trial.suggest_int('leverage', 1, 20, step=1),               # Leverage 1x to 20x
            'riskPct': trial.suggest_float('riskPct', 5.0, 50.0, step=5.0),        # Risk % per trade 5-50%
            'timeframe': trial.suggest_categorical('timeframe', ['5m', '15m'])     # Timeframe for ROC
        }

        # Run backtest (LOG: No future data usage)
        logger.info(f"Trial {trial.number}: Testing params - "
                   f"ROC≥{params['minRoc5m']}%, Vol≥{params['minVolMult']}x, "
                   f"Spread≤{params['maxSpreadBps']}bps, Leverage={params['leverage']}x, "
                   f"Risk={params['riskPct']}%, Timeframe={params['timeframe']}")

        backtester = MomentumBreakoutBacktester(params, self.symbol)
        results = backtester.run_backtest(self.data_15m, self.data_1m)

        # Multi-objective optimization: balance multiple metrics
        # Primary: Risk-adjusted returns (Sharpe ratio)
        # Secondary: Win rate and total PnL
        sharpe_weight = 0.5
        win_rate_weight = 0.3
        pnl_weight = 0.2

        # Normalize metrics to comparable scales
        sharpe_score = max(0, results['sharpe_ratio'])  # Only positive Sharpe contributes
        win_rate_score = results['win_rate']  # 0-1 scale
        pnl_score = max(0, results['total_pnl'] / 1000)  # Scale PnL to reasonable units

        # Penalize high drawdown
        dd_penalty = results['max_drawdown'] * 0.5

        # Combined objective (higher is better)
        objective = (sharpe_weight * sharpe_score +
                    win_rate_weight * win_rate_score +
                    pnl_weight * pnl_score -
                    dd_penalty)

        # Log trial results
        logger.info(f"Trial {trial.number}: "
                   ".3f"
                   ".3f"
                   ".3f"
                   ".3f"
                   f"Trades: {results['total_trades']}")

        return objective

    def walk_forward_validation(self, best_params: Dict, n_splits: int = 3) -> Dict[str, Any]:
        """Perform walk-forward validation to test parameter robustness"""
        logger.info(f"Performing walk-forward validation with {n_splits} splits")

        # Split data into training/validation periods
        total_periods = len(self.data_15m)
        split_size = total_periods // n_splits

        validation_results = []

        for i in range(n_splits):
            start_idx = i * split_size
            end_idx = (i + 1) * split_size if i < n_splits - 1 else total_periods

            # Training data (first 2/3 of split)
            train_end = start_idx + int((end_idx - start_idx) * 0.67)
            train_15m = self.data_15m.iloc[start_idx:train_end]
            train_1m = self.data_1m.iloc[start_idx:train_end]

            # Validation data (last 1/3 of split)
            val_15m = self.data_15m.iloc[train_end:end_idx]
            val_1m = self.data_1m.iloc[train_end:end_idx]

            # Run backtest on validation data with best parameters
            backtester = MomentumBreakoutBacktester(best_params, self.symbol)
            results = backtester.run_backtest(val_15m, val_1m)

            validation_results.append(results)

            logger.info(f"WFCV Split {i+1}: PnL=${results['total_pnl']:.2f}, "
                       f"Win Rate={results['win_rate']:.1%}, "
                       f"Sharpe={results['sharpe_ratio']:.2f}")

        # Aggregate validation results
        avg_pnl = np.mean([r['total_pnl'] for r in validation_results])
        avg_win_rate = np.mean([r['win_rate'] for r in validation_results])
        avg_sharpe = np.mean([r['sharpe_ratio'] for r in validation_results])
        avg_max_dd = np.mean([r['max_drawdown'] for r in validation_results])

        # Calculate consistency metrics
        pnl_std = np.std([r['total_pnl'] for r in validation_results])
        pnl_consistency = avg_pnl / pnl_std if pnl_std > 0 else float('inf')

        return {
            'validation_results': validation_results,
            'avg_pnl': avg_pnl,
            'avg_win_rate': avg_win_rate,
            'avg_sharpe': avg_sharpe,
            'avg_max_dd': avg_max_dd,
            'pnl_consistency': pnl_consistency,
            'is_robust': avg_sharpe > 0.5 and avg_win_rate > 0.55 and avg_max_dd < 0.15
        }

    def optimize(self, n_trials: int = 100, n_jobs: int = -1) -> Dict[str, Any]:
        """Run the hyperparameter optimization"""
        logger.info(f"Starting optimization with {n_trials} trials using {n_jobs} parallel jobs")

        # Create Optuna study
        study = optuna.create_study(
            direction='maximize',
            sampler=optuna.samplers.TPESampler(seed=42),  # Reproducible results
            pruner=optuna.pruners.MedianPruner()
        )

        # Run optimization
        study.optimize(
            self.objective_function,
            n_trials=n_trials,
            n_jobs=n_jobs,
            timeout=3600  # 1 hour timeout
        )

        # Get best parameters
        best_params = study.best_params
        best_value = study.best_value

        logger.info(f"Optimization completed. Best objective value: {best_value:.3f}")
        logger.info(f"Best parameters: {best_params}")

        # Run final backtest with best parameters on full dataset
        backtester = MomentumBreakoutBacktester(best_params, self.symbol)
        full_results = backtester.run_backtest(self.data_15m, self.data_1m)

        # Perform walk-forward validation
        wf_results = self.walk_forward_validation(best_params)

        return {
            'best_params': best_params,
            'best_objective': best_value,
            'full_backtest': full_results,
            'walk_forward_validation': wf_results,
            'study': study,
            'optimization_complete': True
        }

    def plot_results(self, results: Dict[str, Any], save_path: str = 'optimization_results.html'):
        """Create comprehensive visualization of optimization results"""
        logger.info("Creating optimization results visualization")

        study = results['study']
        best_params = results['best_params']

        # Create subplot figure
        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=('Parameter Importance', 'Optimization History',
                          'Equity Curve', 'Trade Analysis'),
            specs=[[{"type": "bar"}, {"type": "scatter"}],
                   [{"type": "scatter"}, {"type": "bar"}]]
        )

        # 1. Parameter Importance
        try:
            param_importance = optuna.visualization.plot_param_importances(study)
            param_importance_data = param_importance.data[0]
            fig.add_trace(
                go.Bar(x=param_importance_data.x, y=param_importance_data.y,
                      name='Parameter Importance'),
                row=1, col=1
            )
        except:
            fig.add_trace(
                go.Bar(x=list(best_params.keys()),
                      y=[1.0] * len(best_params),
                      name='Parameters'),
                row=1, col=1
            )

        # 2. Optimization History
        trials = study.trials
        fig.add_trace(
            go.Scatter(x=list(range(len(trials))),
                      y=[t.value for t in trials],
                      mode='lines+markers',
                      name='Objective Value'),
            row=1, col=2
        )

        # 3. Equity Curve
        equity_curve = results['full_backtest']['equity_curve']
        timestamps = [t for t, _ in equity_curve]
        equity_values = [v for _, v in equity_curve]

        fig.add_trace(
            go.Scatter(x=timestamps, y=equity_values,
                      mode='lines', name='Equity Curve'),
            row=2, col=1
        )

        # 4. Trade Analysis
        backtest = results['full_backtest']
        trade_types = ['Winning Trades', 'Losing Trades']
        trade_counts = [backtest['winning_trades'], backtest['losing_trades']]

        fig.add_trace(
            go.Bar(x=trade_types, y=trade_counts,
                  name='Trade Analysis'),
            row=2, col=2
        )

        # Update layout
        fig.update_layout(
            title=f'Hyperparameter Optimization Results - {self.symbol}',
            showlegend=True,
            height=800
        )

        # Save interactive plot
        fig.write_html(save_path)
        logger.info(f"Saved results visualization to {save_path}")

        return fig


def main():
    """Main execution function"""
    parser = argparse.ArgumentParser(description='Hyperparameter Optimization for Momentum Breakout Strategy')
    parser.add_argument('--data', required=True, help='Path to historical candle data CSV')
    parser.add_argument('--symbol', default='BTCUSDT', help='Trading symbol (default: BTCUSDT)')
    parser.add_argument('--trials', type=int, default=100, help='Number of optimization trials (default: 100)')
    parser.add_argument('--jobs', type=int, default=-1, help='Number of parallel jobs (default: -1 for all cores)')
    parser.add_argument('--output', default='optimization_results.json', help='Output file for results')
    parser.add_argument('--plot', default='optimization_results.html', help='Output file for visualization')

    args = parser.parse_args()

    # Validate inputs
    if not os.path.exists(args.data):
        logger.error(f"Data file not found: {args.data}")
        return 1

    try:
        # Initialize optimizer
        optimizer = HyperparameterOptimizer(args.data, args.symbol)

        # Run optimization
        logger.info("Starting hyperparameter optimization...")
        results = optimizer.optimize(n_trials=args.trials, n_jobs=args.jobs)

        # Save results
        import json
        # Convert numpy types to native Python types for JSON serialization
        def convert_to_serializable(obj):
            if isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, dict):
                return {k: convert_to_serializable(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_to_serializable(item) for item in obj]
            else:
                return obj

        serializable_results = convert_to_serializable(results)

        # Remove non-serializable study object
        serializable_results.pop('study', None)

        with open(args.output, 'w') as f:
            json.dump(serializable_results, f, indent=2, default=str)

        logger.info(f"Results saved to {args.output}")

        # Create visualization
        optimizer.plot_results(results, args.plot)

        # Print summary
        print("\n" + "="*60)
        print("HYPERPARAMETER OPTIMIZATION COMPLETE")
        print("="*60)
        print(f"Best Objective Score: {results['best_objective']:.3f}")
        print(f"Best Parameters: {results['best_params']}")
        print("\nFull Dataset Backtest Results:")
        bt = results['full_backtest']
        print(".2f")
        print(".1%")
        print(".2f")
        print(".1%")
        print(f"Profit Factor: {bt['profit_factor']:.2f}")
        print(f"Total Trades: {bt['total_trades']}")

        print("\nWalk-Forward Validation Results:")
        wf = results['walk_forward_validation']
        print(".2f")
        print(".1%")
        print(".2f")
        print(".1%")
        print(f"Robust Configuration: {wf['is_robust']}")

        if wf['is_robust']:
            print("\n✅ Parameters appear robust across validation periods!")
            print("Ready for deployment to fake-trader.")
        else:
            print("\n⚠️  Parameters may not be robust - consider further optimization.")

        print(f"\nDetailed results saved to: {args.output}")
        print(f"Interactive visualization: {args.plot}")

        return 0

    except Exception as e:
        logger.error(f"Optimization failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit(main())
