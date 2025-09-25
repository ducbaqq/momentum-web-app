#!/bin/bash
# Export Training Data for Hyperparameter Optimization
# ===================================================

set -e

echo "📊 Exporting Training Data for Hyperparameter Optimization"
echo "========================================================="

# Configuration
# DATABASE_URL should be in format: postgresql://username:password@host[:port]/database
DATABASE_URL="${DATABASE_URL:-postgresql://user:pass@localhost:5432/database}"
SYMBOL="${SYMBOL:-BTCUSDT}"

# Parse DATABASE_URL to extract connection parameters
# Format: postgresql://user:password@host[:port]/database
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?(/([^?]*)) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[5]:-5432}"  # Default to 5432 if no port specified
    DB_NAME="${BASH_REMATCH[6]#/}"  # Remove leading slash from database name

    # Validate extracted values
    if [[ -z "$DB_USER" || -z "$DB_PASS" || -z "$DB_HOST" || -z "$DB_PORT" || -z "$DB_NAME" ]]; then
        echo "❌ Error: Failed to parse DATABASE_URL. Missing required components."
        echo "Expected format: postgresql://user:password@host:port/database"
        echo "Parsed - User: '$DB_USER', Host: '$DB_HOST', Port: '$DB_PORT', Database: '$DB_NAME'"
        exit 1
    fi
else
    echo "❌ Error: Invalid DATABASE_URL format. Expected: postgresql://user:password@host[:port]/database"
    echo "Examples:"
    echo "  postgresql://myuser:mypass@localhost:5432/trading_db"
    echo "  postgresql://user:pass@ep-cool-mode-123.us-east-1.aws.neon.tech/neondb"
    echo "  postgresql://neondb_owner:password@host-pooler.region.aws.neon.tech/neondb"
    echo ""
    echo "Current DATABASE_URL: $DATABASE_URL"
    exit 1
fi

# Date calculations
# Based on your data availability check, dates are in 2025
# Full period: Aug 11 - Sep 24, 2025 (~45 days)
# Training: First 80% (~36 days) → Aug 11 - Sep 16, 2025
TRAINING_START="2025-08-11 00:00:00+00"
TRAINING_END="2025-09-16 00:00:00+00"

echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo "Symbol: $SYMBOL"
echo "Training period: $TRAINING_START to $TRAINING_END"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql command not found. Please install PostgreSQL client tools."
    exit 1
fi

# Set password for psql
export PGPASSWORD="$DB_PASS"

# Export training data
echo "📤 Exporting training data..."
echo "Running query for symbol: $SYMBOL, dates: $TRAINING_START to $TRAINING_END"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
     -v "training_start=$TRAINING_START" \
     -v "training_end=$TRAINING_END" \
     -v "symbol_filter=$SYMBOL" \
     -f export_training_data.sql \
     -o historical_data.csv \
     -F ',' -A; then

    # Clean up password from environment
    unset PGPASSWORD

    echo "✅ Training data exported successfully!"
    echo "📁 File: historical_data.csv"

    # Show data summary
    echo ""
    echo "📈 Data Summary:"
    echo "---------------"
    head -5 historical_data.csv | column -t -s ','
    echo "..."
    echo "Total rows: $(wc -l < historical_data.csv)"
    echo ""

    echo "🎯 Next Steps:"
    echo "1. Review the data: head -10 historical_data.csv"
    echo "2. Run data preparation: python prepare_data.py historical_data.csv"
    echo "3. Start optimization: python run_optimization.py"
else
    # Clean up password from environment even on failure
    unset PGPASSWORD
    echo "❌ Export failed. Please check your database connection and credentials."
    echo "   DATABASE_URL: $DATABASE_URL"
    exit 1
fi
