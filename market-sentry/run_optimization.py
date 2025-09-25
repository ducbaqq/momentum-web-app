#!/usr/bin/env python3
"""
Simple runner script for hyperparameter optimization.
Loads configuration from config.yaml and runs the optimization.
"""

import yaml
import sys
import os
import argparse
from hyperparameter_optimizer import HyperparameterOptimizer

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Run hyperparameter optimization')
    parser.add_argument('--config', default='config.yaml', help='Path to config file')
    args = parser.parse_args()

    # Load configuration
    config_path = args.config
    if not os.path.exists(config_path):
        print(f"Configuration file not found: {config_path}")
        print("Please create config.yaml or specify a different config file with --config")
        return 1

    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Validate data file exists
    data_path = config['data']['path']
    if not os.path.exists(data_path):
        print(f"Data file not found: {data_path}")
        print("Please export historical data from your web-app and update config.yaml")
        return 1

    try:
        # Initialize optimizer
        optimizer = HyperparameterOptimizer(
            data_path=data_path,
            symbol=config['data']['symbol'],
            config=config
        )

        # Run optimization
        print("Starting hyperparameter optimization...")
        results = optimizer.optimize(
            n_trials=config['optimization']['n_trials'],
            n_jobs=config['optimization']['n_jobs']
        )

        # Save results
        import json

        def convert_to_serializable(obj):
            """Convert numpy types to JSON serializable types"""
            if hasattr(obj, 'item'):  # numpy types
                return obj.item()
            elif isinstance(obj, dict):
                return {k: convert_to_serializable(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_to_serializable(item) for item in obj]
            else:
                return obj

        serializable_results = convert_to_serializable(results)
        serializable_results.pop('study', None)  # Remove non-serializable study object

        output_file = config['output']['results_file']
        with open(output_file, 'w') as f:
            json.dump(serializable_results, f, indent=2, default=str)

        print(f"Results saved to {output_file}")

        # Create visualization
        plot_file = config['output']['plot_file']
        optimizer.plot_results(results, plot_file)
        print(f"Visualization saved to {plot_file}")

        # Print summary
        print("\n" + "="*60)
        print("OPTIMIZATION COMPLETE")
        print("="*60)
        print(f"Best Objective: {results['best_objective']:.3f}")
        print(f"Best Parameters: {results['best_params']}")

        bt = results['full_backtest']
        print("\nFull Dataset Results:")
        print(".2f")
        print(".1%")
        print(".2f")

        wf = results['walk_forward_validation']
        print("\nWalk-Forward Validation:")
        print(".2f")
        print(".1%")

        if wf['is_robust']:
            print("\n✅ Robust parameters found! Ready for deployment.")
        else:
            print("\n⚠️  Parameters may need further tuning.")

        return 0

    except Exception as e:
        print(f"Optimization failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    exit(main())
