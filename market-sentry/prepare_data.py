#!/usr/bin/env python3
"""
Data Preparation Script for Hyperparameter Optimization

This script helps format your web-app exported data for use with the optimizer.
It validates the data structure and adds any missing columns if needed.
"""

import pandas as pd
import numpy as np
import argparse
import logging
import sys

logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def validate_and_prepare_data(input_file: str, output_file: str = None) -> bool:
    """
    Validate and prepare historical data for optimization.

    Args:
        input_file: Path to your web-app exported CSV
        output_file: Path for cleaned data (optional)

    Returns:
        True if successful, False otherwise
    """
    try:
        # Load data
        logger.info(f"Loading data from {input_file}")
        df = pd.read_csv(input_file)
        logger.info(f"Loaded {len(df)} rows with {len(df.columns)} columns")

        # Check for required columns
        required_columns = ['open', 'high', 'low', 'close', 'volume']
        missing_required = [col for col in required_columns if col not in df.columns]

        if missing_required:
            logger.error(f"Missing required OHLCV columns: {missing_required}")
            return False

        # Check for timestamp column
        timestamp_cols = ['timestamp', 'ts', 'time']
        timestamp_col = None
        for col in timestamp_cols:
            if col in df.columns:
                timestamp_col = col
                break

        if not timestamp_col:
            logger.error("No timestamp column found. Expected: 'timestamp', 'ts', or 'time'")
            return False

        # Convert timestamp
        logger.info(f"Converting {timestamp_col} to datetime")
        df[timestamp_col] = pd.to_datetime(df[timestamp_col], errors='coerce')
        df = df.dropna(subset=[timestamp_col])
        df = df.set_index(timestamp_col).sort_index()

        # Check for technical indicators (add defaults if missing)
        technical_defaults = {
            'roc_1m': 0.0,
            'roc_5m': 0.0,
            'roc_15m': 0.0,
            'roc_30m': 0.0,
            'roc_1h': 0.0,
            'roc_4h': 0.0,
            'rsi_14': 50.0,  # Neutral RSI
            'vol_mult': 1.0,  # Neutral volume
            'spread_bps': 5.0,  # 5 bps default spread
            'book_imb': 0.0    # Neutral order book imbalance
        }

        missing_technical = []
        for col, default in technical_defaults.items():
            if col not in df.columns:
                logger.warning(f"Adding missing technical column: {col} (default: {default})")
                df[col] = default
                missing_technical.append(col)

        # Validate data quality
        logger.info("Validating data quality...")

        # Check for NaN values in critical columns
        critical_cols = required_columns + ['roc_5m', 'vol_mult', 'spread_bps']
        nan_counts = df[critical_cols].isnull().sum()

        if nan_counts.sum() > 0:
            logger.warning("Found NaN values in critical columns:")
            for col, count in nan_counts.items():
                if count > 0:
                    logger.warning(f"  {col}: {count} NaN values")

            # Fill NaN values with reasonable defaults
            logger.info("Filling NaN values with defaults...")
            df['roc_5m'] = df['roc_5m'].fillna(0.0)
            df['vol_mult'] = df['vol_mult'].fillna(1.0)
            df['spread_bps'] = df['spread_bps'].fillna(5.0)

        # Check data frequency (should be 1-minute)
        time_diffs = df.index.to_series().diff().dropna()
        avg_diff_minutes = time_diffs.mean().total_seconds() / 60

        if abs(avg_diff_minutes - 1.0) > 0.5:
            logger.warning(".1f"
                          "Optimization works best with 1-minute data.")

        # Check data range
        date_range = df.index.max() - df.index.min()
        days = date_range.total_seconds() / (24 * 3600)

        if days < 7:
            logger.warning(".1f"
                          "Consider using more historical data (30+ days recommended).")

        # Final statistics
        logger.info("Data preparation complete!")
        logger.info(f"Date range: {df.index.min()} to {df.index.max()}")
        logger.info(f"Total candles: {len(df)}")
        logger.info(".2f")
        logger.info(".2f")
        logger.info(".2f")

        if missing_technical:
            logger.info(f"Added {len(missing_technical)} technical columns with defaults")

        # Save prepared data
        if output_file:
            df.to_csv(output_file)
            logger.info(f"Prepared data saved to {output_file}")
        else:
            # Overwrite original file
            df.to_csv(input_file)
            logger.info(f"Prepared data saved to {input_file}")

        # Print data sample
        logger.info("\nData sample (first 5 rows):")
        print(df.head().to_string())

        return True

    except Exception as e:
        logger.error(f"Data preparation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description='Prepare historical data for hyperparameter optimization')
    parser.add_argument('input', help='Path to your web-app exported CSV file')
    parser.add_argument('--output', help='Path for prepared data (optional, defaults to overwriting input)')

    args = parser.parse_args()

    if not args.input:
        logger.error("Please provide input file path")
        return 1

    success = validate_and_prepare_data(args.input, args.output)

    if success:
        logger.info("\n✅ Data preparation successful!")
        logger.info("You can now run optimization with: python run_optimization.py")
        return 0
    else:
        logger.error("\n❌ Data preparation failed. Please check the errors above.")
        return 1

if __name__ == '__main__':
    exit(main())
