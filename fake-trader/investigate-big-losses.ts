import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function getDbUrl(dbName: 'dev' | 'staging'): string {
  if (process.env.DB_BASE_URL) {
    return `${process.env.DB_BASE_URL}/${dbName}`;
  }
  if (process.env.DATABASE_URL) {
    const baseUrl = process.env.DATABASE_URL;
    const match = baseUrl.match(/\/([^/?]+)(\?|$)/);
    if (match) {
      return baseUrl.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
    }
  }
  throw new Error(`Cannot determine database URL for ${dbName}`);
}

function createPool(dbName: 'dev' | 'staging'): Pool {
  const url = getDbUrl(dbName);
  const isDigitalOcean = url.includes('ondigitalocean') || url.includes('ssl') || url.includes('sslmode=require');
  return new Pool({
    connectionString: url,
    ssl: isDigitalOcean ? { rejectUnauthorized: false } : false,
    max: 3,
  });
}

async function investigateTrades() {
  const stagingPool = createPool('staging');
  
  try {
    const runId = 'c585d026-3a7f-444a-b311-ab6b181d3cb5';
    
    console.log('🔍 Investigating trades for run:', runId);
    
    // Get all trades
    const tradesQuery = `
      SELECT 
        trade_id,
        symbol,
        side,
        entry_ts,
        exit_ts,
        qty,
        entry_px,
        exit_px,
        realized_pnl,
        fees,
        status,
        reason
      FROM ft_trades
      WHERE run_id = $1
      ORDER BY entry_ts ASC
    `;
    
    const tradesResult = await stagingPool.query(tradesQuery, [runId]);
    
    console.log(`\n📊 Found ${tradesResult.rows.length} trades:\n`);
    
    for (const trade of tradesResult.rows) {
      const entryPrice = Number(trade.entry_px);
      const exitPrice = trade.exit_px ? Number(trade.exit_px) : null;
      const pnl = Number(trade.realized_pnl);
      const fees = Number(trade.fees);
      
      console.log(`Trade ${trade.trade_id.substring(0, 8)}...`);
      console.log(`  ${trade.symbol} ${trade.side}`);
      console.log(`  Entry: $${entryPrice.toFixed(2)} @ ${trade.entry_ts}`);
      console.log(`  Exit: ${exitPrice ? `$${exitPrice.toFixed(2)}` : 'OPEN'} @ ${trade.exit_ts || 'N/A'}`);
      console.log(`  P&L: $${pnl.toFixed(2)}, Fees: $${fees.toFixed(2)}, Net: $${(pnl - fees).toFixed(2)}`);
      
      if (exitPrice) {
        const priceMove = trade.side === 'LONG' 
          ? ((exitPrice - entryPrice) / entryPrice * 100)
          : ((entryPrice - exitPrice) / entryPrice * 100);
        console.log(`  Price move: ${priceMove.toFixed(2)}%`);
        
        // Check expected stop loss/take profit
        if (trade.side === 'LONG') {
          const expectedStopLoss = entryPrice * 0.98; // 2% below
          const expectedTakeProfit = entryPrice * 1.03; // 3% above
          console.log(`  Expected stop loss: $${expectedStopLoss.toFixed(2)}`);
          console.log(`  Expected take profit: $${expectedTakeProfit.toFixed(2)}`);
          
          if (exitPrice < expectedStopLoss) {
            console.log(`  ⚠️  Exited BELOW stop loss!`);
          } else if (exitPrice > expectedTakeProfit) {
            console.log(`  ⚠️  Exited ABOVE take profit!`);
          }
        } else {
          const expectedStopLoss = entryPrice * 1.02; // 2% above for SHORT
          const expectedTakeProfit = entryPrice * 0.97; // 3% below for SHORT
          console.log(`  Expected stop loss: $${expectedStopLoss.toFixed(2)}`);
          console.log(`  Expected take profit: $${expectedTakeProfit.toFixed(2)}`);
          
          if (exitPrice > expectedStopLoss) {
            console.log(`  ⚠️  Exited ABOVE stop loss!`);
          } else if (exitPrice < expectedTakeProfit) {
            console.log(`  ⚠️  Exited BELOW take profit!`);
          }
        }
      }
      console.log('');
    }
    
    // Check positions to see if they had stop_loss/take_profit set
    const positionsQuery = `
      SELECT 
        position_id,
        symbol,
        side,
        entry_price,
        current_price,
        stop_loss,
        take_profit,
        opened_at,
        last_update,
        status
      FROM ft_positions
      WHERE run_id = $1
      ORDER BY opened_at ASC
    `;
    
    const positionsResult = await stagingPool.query(positionsQuery, [runId]);
    
    console.log(`\n📍 Found ${positionsResult.rows.length} positions:\n`);
    
    for (const pos of positionsResult.rows) {
      console.log(`Position ${pos.position_id.substring(0, 8)}...`);
      console.log(`  ${pos.symbol} ${pos.side}`);
      console.log(`  Entry: $${Number(pos.entry_price).toFixed(2)}`);
      console.log(`  Current: ${pos.current_price ? `$${Number(pos.current_price).toFixed(2)}` : 'N/A'}`);
      console.log(`  Stop Loss: ${pos.stop_loss ? `$${Number(pos.stop_loss).toFixed(2)}` : 'NOT SET'}`);
      console.log(`  Take Profit: ${pos.take_profit ? `$${Number(pos.take_profit).toFixed(2)}` : 'NOT SET'}`);
      console.log(`  Status: ${pos.status}`);
      console.log(`  Opened: ${pos.opened_at}, Last Update: ${pos.last_update}`);
      console.log('');
    }
    
    // Check signals to see exit reasons
    const signalsQuery = `
      SELECT 
        signal_id,
        symbol,
        signal_type,
        side,
        signal_ts,
        executed,
        rejection_reason,
        execution_notes
      FROM ft_signals
      WHERE run_id = $1
      AND symbol = 'ATOMUSDT'
      ORDER BY signal_ts DESC
      LIMIT 20
    `;
    
    const signalsResult = await stagingPool.query(signalsQuery, [runId]);
    
    console.log(`\n📡 Recent signals for ATOMUSDT (last 20):\n`);
    
    for (const signal of signalsResult.rows) {
      console.log(`${signal.signal_ts} - ${signal.signal_type} ${signal.side || 'N/A'} - Executed: ${signal.executed}`);
      if (signal.rejection_reason) {
        console.log(`  Rejection: ${signal.rejection_reason}`);
      }
      if (signal.execution_notes) {
        console.log(`  Notes: ${signal.execution_notes}`);
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await stagingPool.end();
  }
}

investigateTrades().catch(console.error);

