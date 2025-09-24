#!/bin/bash
# Market Sentry Setup and Run Script
# ================================

set -e  # Exit on any error

echo "🚀 Market Sentry: Hyperparameter Optimization Setup"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "requirements.txt" ]; then
    echo "❌ Error: Please run this script from the market-sentry directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Check for data file
if [ ! -f "historical_data.csv" ]; then
    echo ""
    echo "⚠️  historical_data.csv not found!"
    echo ""
    echo "To get your data:"
    echo "1. Go to your web-app backtest page"
    echo "2. Create a new backtest with 30-90 days of data"
    echo "3. Click '📥 Download Candle Data'"
    echo "4. Save as 'historical_data.csv' in this directory"
    echo "5. Run this script again"
    echo ""
    echo "Alternatively, run: python prepare_data.py /path/to/your/exported/data.csv"
    exit 1
fi

# Prepare data
echo ""
echo "🔧 Preparing and validating data..."
python prepare_data.py historical_data.csv

# Run optimization
echo ""
echo "🎯 Starting hyperparameter optimization..."
python run_optimization.py

echo ""
echo "✅ Optimization complete!"
echo ""
echo "📊 Results:"
echo "  - optimization_results.html  (Interactive visualization)"
echo "  - optimization_results.json  (Detailed results)"
echo "  - optimization.log          (Debug logs)"
echo ""
echo "📋 Next steps:"
echo "1. Open optimization_results.html to review parameter performance"
echo "2. Check optimization_results.json for best parameters"
echo "3. Deploy best parameters to your fake-trader"
echo ""
echo "🎉 Ready to optimize your trading strategy!"
