#!/usr/bin/env tsx
/**
 * Check ft_* tables in momentum_collector database
 * Usage: tsx check-ft-tables.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dataPool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_BASE_URL ? `${process.env.DB_BASE_URL}/momentum_collector` : undefined,
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') || process.env.DB_BASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

async function checkFtTables() {
  try {
    console.log('🔍 Checking ft_* tables in momentum_collector database...\n');
    
    // Get all tables starting with ft_
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'ft_%'
      ORDER BY table_name
    `;
    
    const tablesResult = await dataPool.query(tablesQuery);
    const tableNames = tablesResult.rows.map(row => row.table_name);
    
    console.log(`Found ${tableNames.length} tables starting with 'ft_':\n`);
    
    for (const tableName of tableNames) {
      console.log(`📊 Table: ${tableName}`);
      
      // Get table structure
      const columnsQuery = `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position
      `;
      
      const columnsResult = await dataPool.query(columnsQuery, [tableName]);
      
      console.log(`   Columns:`);
      for (const col of columnsResult.rows) {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      }
      
      // Get constraints
      const constraintsQuery = `
        SELECT 
          constraint_name,
          constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema = 'public' 
        AND table_name = $1
      `;
      
      const constraintsResult = await dataPool.query(constraintsQuery, [tableName]);
      
      if (constraintsResult.rows.length > 0) {
        console.log(`   Constraints:`);
        for (const constraint of constraintsResult.rows) {
          console.log(`     - ${constraint.constraint_name}: ${constraint.constraint_type}`);
        }
      }
      
      // Get indexes
      const indexesQuery = `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' 
        AND tablename = $1
      `;
      
      const indexesResult = await dataPool.query(indexesQuery, [tableName]);
      
      if (indexesResult.rows.length > 0) {
        console.log(`   Indexes:`);
        for (const idx of indexesResult.rows) {
          console.log(`     - ${idx.indexname}`);
        }
      }
      
      console.log('');
    }
    
    // Generate CREATE TABLE statements
    console.log('\n📝 Generating CREATE TABLE statements...\n');
    
    for (const tableName of tableNames) {
      const createTableQuery = `
        SELECT 
          'CREATE TABLE IF NOT EXISTS ' || table_name || ' (' ||
          string_agg(
            column_name || ' ' || 
            CASE 
              WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
              WHEN data_type = 'numeric' THEN 'NUMERIC(' || numeric_precision || ',' || numeric_scale || ')'
              WHEN data_type = 'double precision' THEN 'DOUBLE PRECISION'
              WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMP WITH TIME ZONE'
              WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
              WHEN data_type = 'character' THEN 'CHAR(' || character_maximum_length || ')'
              ELSE UPPER(data_type)
            END ||
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
            CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
            ', '
            ORDER BY ordinal_position
          ) ||
          ');' as create_statement
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = $1
        GROUP BY table_name
      `;
      
      // Note: This is a simplified version. For full schema extraction, we'd need to use pg_dump or similar
      console.log(`-- Table: ${tableName}`);
      console.log(`-- Full schema export would require pg_dump`);
      console.log('');
    }
    
    console.log('\n✅ Check complete!');
    console.log('\n💡 To get full CREATE TABLE statements with constraints and indexes,');
    console.log('   use: pg_dump -t ft_* --schema-only momentum_collector');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await dataPool.end();
  }
}

checkFtTables();

