import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Read and execute canonical tables SQL
      const canonicalTablesSQL = fs.readFileSync(
        path.join(process.cwd(), 'fake-trader', 'create-canonical-tables.sql'),
        'utf-8'
      );
      
      await client.query(canonicalTablesSQL);
      
      // Read and execute events table SQL
      const eventsTableSQL = fs.readFileSync(
        path.join(process.cwd(), 'fake-trader', 'create-events-table.sql'),
        'utf-8'
      );
      
      await client.query(eventsTableSQL);
      
      await client.query('COMMIT');
      
      // Verify tables exist
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
          'ft_account_snapshots',
          'ft_positions_v2',
          'ft_orders',
          'ft_fills',
          'ft_price_snapshots',
          'ft_events'
        )
        ORDER BY table_name
      `;
      
      const result = await client.query(tablesQuery);
      const existingTables = result.rows.map(row => row.table_name);
      
      const requiredTables = [
        'ft_account_snapshots',
        'ft_positions_v2',
        'ft_orders',
        'ft_fills',
        'ft_price_snapshots',
        'ft_events'
      ];
      
      const missingTables = requiredTables.filter(t => !existingTables.includes(t));
      
      if (missingTables.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'Some tables were not created',
          missingTables,
          existingTables
        }, { status: 500 });
      }
      
      return NextResponse.json({
        success: true,
        message: 'Canonical tables created successfully',
        tables: existingTables
      });
      
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
}

