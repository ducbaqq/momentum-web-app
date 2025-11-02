#!/usr/bin/env tsx
/**
 * Check database for position rules migration
 * Verifies:
 * 1. Unique index exists
 * 2. ft_positions_v2 table structure
 * 3. Status column allows 'NEW'
 * 4. Index is working correctly
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') 
    ? { rejectUnauthorized: false } 
    : undefined,
});

async function checkDatabase() {
  console.log('🔍 Checking database for position rules migration...\n');
  
  try {
    // 1. Check if ft_positions_v2 table exists
    console.log('1. Checking ft_positions_v2 table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ft_positions_v2'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('   ❌ ft_positions_v2 table does not exist!');
      console.log('   💡 Run: fake-trader/create-canonical-tables.sql');
      await pool.end();
      process.exit(1);
    }
    console.log('   ✅ ft_positions_v2 table exists\n');
    
    // 2. Check if status column allows 'NEW'
    console.log('2. Checking status column constraint...');
    const statusCheck = await pool.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name LIKE '%ft_positions_v2%status%'
      OR constraint_name LIKE '%position%status%'
      ORDER BY constraint_name;
    `);
    
    if (statusCheck.rows.length === 0) {
      console.log('   ⚠️  Could not find status constraint (might be named differently)');
    } else {
      statusCheck.rows.forEach(row => {
        console.log(`   ✅ Constraint: ${row.constraint_name}`);
        console.log(`      ${row.check_clause}`);
      });
    }
    
    // Check actual constraint on the column
    const columnCheck = await pool.query(`
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ft_positions_v2'
      AND column_name = 'status';
    `);
    
    if (columnCheck.rows.length > 0) {
      const statusCol = columnCheck.rows[0];
      console.log(`   ✅ Status column found: ${statusCol.data_type}, default: ${statusCol.column_default || 'NULL'}\n`);
    } else {
      console.log('   ❌ Status column not found!\n');
    }
    
    // 3. Check if unique index exists
    console.log('3. Checking unique index for position rules...');
    const indexCheck = await pool.query(`
      SELECT 
        indexname, 
        indexdef,
        indisunique as is_unique
      FROM pg_indexes 
      LEFT JOIN pg_index ON pg_indexes.indexname = (
        SELECT relname FROM pg_class WHERE oid = pg_index.indexrelid
      )
      WHERE tablename = 'ft_positions_v2' 
      AND indexname = 'idx_ft_positions_v2_unique_active_per_side';
    `);
    
    if (indexCheck.rows.length === 0) {
      console.log('   ❌ Unique index idx_ft_positions_v2_unique_active_per_side NOT FOUND!');
      console.log('   💡 Run: fake-trader/migrate-add-position-uniqueness-constraint.sql\n');
    } else {
      const index = indexCheck.rows[0];
      console.log(`   ✅ Index found: ${index.indexname}`);
      console.log(`   ✅ Is unique: ${index.is_unique}`);
      console.log(`   📋 Definition:\n      ${index.indexdef}\n`);
    }
    
    // 4. Check for any existing violations (duplicate LONG/SHORT positions)
    console.log('4. Checking for existing duplicate positions...');
    const duplicateCheck = await pool.query(`
      SELECT 
        run_id,
        symbol,
        side,
        COUNT(*) as count
      FROM ft_positions_v2
      WHERE status IN ('NEW', 'OPEN')
      GROUP BY run_id, symbol, side
      HAVING COUNT(*) > 1;
    `);
    
    if (duplicateCheck.rows.length > 0) {
      console.log(`   ⚠️  Found ${duplicateCheck.rows.length} duplicate position groups:`);
      duplicateCheck.rows.forEach(row => {
        console.log(`      Run: ${row.run_id.substring(0, 8)}..., Symbol: ${row.symbol}, Side: ${row.side}, Count: ${row.count}`);
      });
      console.log('   ⚠️  These should not exist with the unique index!\n');
    } else {
      console.log('   ✅ No duplicate positions found\n');
    }
    
    // 5. Check for overlapping LONG/SHORT positions
    console.log('5. Checking for overlapping LONG/SHORT positions...');
    const overlapCheck = await pool.query(`
      SELECT 
        p1.run_id,
        p1.symbol,
        COUNT(DISTINCT p1.side) as sides_count
      FROM ft_positions_v2 p1
      INNER JOIN ft_positions_v2 p2 ON (
        p1.run_id = p2.run_id 
        AND p1.symbol = p2.symbol 
        AND p1.side != p2.side
      )
      WHERE p1.status IN ('NEW', 'OPEN')
      AND p2.status IN ('NEW', 'OPEN')
      GROUP BY p1.run_id, p1.symbol
      HAVING COUNT(DISTINCT p1.side) > 1;
    `);
    
    if (overlapCheck.rows.length > 0) {
      console.log(`   ⚠️  Found ${overlapCheck.rows.length} overlapping LONG/SHORT positions:`);
      overlapCheck.rows.forEach(row => {
        console.log(`      Run: ${row.run_id.substring(0, 8)}..., Symbol: ${row.symbol}`);
      });
      console.log('   ⚠️  These violate the position rules!\n');
    } else {
      console.log('   ✅ No overlapping LONG/SHORT positions found\n');
    }
    
    // 6. Summary
    console.log('📊 Summary:');
    const hasIndex = indexCheck.rows.length > 0;
    const hasDuplicates = duplicateCheck.rows.length > 0;
    const hasOverlaps = overlapCheck.rows.length > 0;
    
    if (hasIndex && !hasDuplicates && !hasOverlaps) {
      console.log('   ✅ All checks passed! Database is properly configured.');
    } else {
      console.log('   ⚠️  Some issues found:');
      if (!hasIndex) {
        console.log('      - Missing unique index (run migration)');
      }
      if (hasDuplicates) {
        console.log('      - Duplicate positions found');
      }
      if (hasOverlaps) {
        console.log('      - Overlapping LONG/SHORT positions found');
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error checking database:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkDatabase();

