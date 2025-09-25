#!/bin/bash
# Check Available Data in Database
# ================================

set -e

echo "🔍 Checking Available Data in Database"
echo "======================================"

# Check if DATABASE_URL is set
if [[ -z "$DATABASE_URL" ]]; then
    echo "❌ DATABASE_URL environment variable not set!"
    echo ""
    echo "Please set your DATABASE_URL:"
    echo "  export DATABASE_URL='your_database_url_here'"
    echo "  ./check_data.sh"
    echo ""
    echo "Or source your .env file:"
    echo "  source .env"
    echo "  ./check_data.sh"
    exit 1
fi

# Parse DATABASE_URL
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?(/([^?]*)) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[5]:-5432}"
    DB_NAME="${BASH_REMATCH[6]#/}"
else
    echo "❌ Invalid DATABASE_URL format"
    exit 1
fi

echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Set password and run check
export PGPASSWORD="$DB_PASS"

echo "📊 Running data availability check..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f check_data.sql

# Cleanup
unset PGPASSWORD

echo ""
echo "✅ Data check complete!"
echo ""
echo "If SOLUSDT shows 0 candles, you may need to:"
echo "1. Check if the symbol name is correct (SOLUSDT vs SOL-USDT)"
echo "2. Verify data exists for the date range"
echo "3. Check if data collection started after Aug 11, 2024"
