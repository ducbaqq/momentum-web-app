#!/usr/bin/env tsx
/**
 * Clear all fake trader data from dev database
 * WARNING: This will delete all runs, trades, positions, and related data
 * Usage: tsx clear-dev-data.ts
 */

import { tradingPool } from './src/db';
import dotenv from 'dotenv';

dotenv.config();

async function clearDevData() {
  const client = await tradingPool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🗑️  Clearing all fake trader data from dev database...');
    
    // Delete in order to respect foreign key constraints
    const deleteOperations = [
      { name: 'Events', query: 'DELETE FROM ft_events' },
      { name: 'Price Snapshots', query: 'DELETE FROM ft_price_snapshots' },
      { name: 'Fills', query: 'DELETE FROM ft_fills' },
      { name: 'Orders', query: 'DELETE FROM ft_orders' },
      { name: 'Account Snapshots', query: 'DELETE FROM ft_account_snapshots' },
      { name: 'Positions V2', query: 'DELETE FROM ft_positions_v2' },
      { name: 'Legacy Positions', query: 'DELETE FROM ft_positions' },
      { name: 'Legacy Trades', query: 'DELETE FROM ft_trades' },
      { name: 'Legacy Equity', query: 'DELETE FROM ft_equity' },
      { name: 'Legacy Results', query: 'DELETE FROM ft_results' },
      { name: 'Legacy Signals', query: 'DELETE FROM ft_signals' },
      { name: 'Runs', query: 'DELETE FROM ft_runs' },
    ];
    
    for (const op of deleteOperations) {
      try {
        const result = await client.query(op.query);
        console.log(`  ✅ Deleted ${result.rowCount || 0} ${op.name}`);
      } catch (error: any) {
        // Table might not exist, skip
        if (error.message.includes('does not exist')) {
          console.log(`  ⏭️  Skipped ${op.name} (table doesn't exist)`);
        } else {
          throw error;
        }
      }
    }
    
    await client.query('COMMIT');
    console.log('\n✅ All fake trader data cleared from dev database');
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error clearing data:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

clearDevData()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

