/**
 * Regime-Filtered Momentum Strategy Runner
 * 
 * Run your exact strategy requirements:
 * - Regime: 1h EMA200 filter + ROC_1h sign
 * - Trigger: 15m close above BB upper with vol_mult_15m ≥ 3 and ROC_15m ≥ 0.6%
 * - Risk: 0.3%/trade, ATR(15m,14)-based stop, partial at 1.2R, trail rest
 * - Guards: spread_bps ≤ 6, book_imb ≥ 1.2, avoid funding minute, kill switch on −2% day
 */

async function createBacktest(config) {
  try {
    const response = await fetch('http://localhost:3000/api/backtest/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Failed to create backtest:', error.message);
    throw error;
  }
}

async function checkBacktestStatus(runId) {
  try {
    const response = await fetch(`http://localhost:3000/api/backtest/runs`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const run = data.runs.find(r => r.run_id === runId);
    return run;
  } catch (error) {
    console.error('Failed to check status:', error.message);
    return null;
  }
}

async function getResults(runId) {
  try {
    const response = await fetch(`http://localhost:3000/api/backtest/results/${runId}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Failed to get results:', error.message);
    return [];
  }
}

async function runRegimeFilteredMomentumStrategy() {
  console.log('🚀 Starting Regime-Filtered Momentum Strategy Backtest\n');

  // Your exact strategy configuration
  const backtestConfig = {
    name: "Regime Filtered Momentum - Professional Setup",
    start_ts: "2024-01-01T00:00:00Z",
    end_ts: "2024-01-31T23:59:59Z",
    symbols: ["BTCUSDT", "ETHUSDT"],  // Add more symbols as needed
    timeframe: "15m",
    strategy_name: "regime_filtered_momentum",
    strategy_version: "1.0",
    starting_capital: 10000,
    params: {
      // Regime Filter: 1h EMA200 + ROC_1h sign
      emaLength: 200,
      rocPositive: true,
      
      // Entry Trigger: 15m BB breakout + volume + momentum
      minVolMult15m: 3.0,        // vol_mult_15m ≥ 3
      minRoc15m: 0.006,          // ROC_15m ≥ 0.6%
      bbTrigger: true,           // close above BB upper
      
      // Risk Management: 0.3%/trade, ATR stops, partial takes
      riskPerTrade: 0.003,       // 0.3% per trade
      atrPeriod: 14,             // ATR(15m, 14)
      atrMultiplier: 2.0,        // ATR-based stop distance
      partialTakeLevel: 1.2,     // 1.2R for partial take
      partialTakePercent: 0.5,   // Take 50% at 1.2R
      trailAfterPartial: true,   // Trail the remaining 50%
      
      // Guards: Spread, book depth, funding, daily loss
      maxSpreadBps: 6,           // spread_bps ≤ 6
      minBookImbalance: 1.2,     // book_imb ≥ 1.2
      avoidFundingMinute: true,  // Skip trades near funding
      killSwitchPercent: 0.02,   // Stop trading on -2% daily loss
      
      // Position Management
      maxConcurrentPositions: 3,
      leverage: 1
    },
    execution: {
      feeBps: 4,      // 0.04% taker fee
      slippageBps: 2  // 0.02% slippage
    },
    seed: Math.floor(Math.random() * 1000000)
  };

  try {
    // 1. Create the backtest
    console.log('📝 Creating backtest with parameters:');
    console.log('   • Symbols:', backtestConfig.symbols.join(', '));
    console.log('   • Timeframe:', backtestConfig.timeframe);
    console.log('   • Period:', backtestConfig.start_ts, 'to', backtestConfig.end_ts);
    console.log('   • Starting Capital: $' + backtestConfig.starting_capital.toLocaleString());
    console.log('   • Risk per Trade:', (backtestConfig.params.riskPerTrade * 100).toFixed(1) + '%');
    console.log('   • Max Positions:', backtestConfig.params.maxConcurrentPositions);
    
    const result = await createBacktest(backtestConfig);
    const runId = result.run_id;
    
    console.log('\n✅ Backtest queued successfully!');
    console.log('   • Run ID:', runId);
    console.log('   • View in UI: http://localhost:3000/backtest');
    
    // 2. Monitor progress
    console.log('\n⏳ Monitoring progress...');
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max wait
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const run = await checkBacktestStatus(runId);
      if (!run) {
        console.log('   ❌ Failed to check status');
        break;
      }
      
      console.log(`   📊 Status: ${run.status.toUpperCase()}`);
      
      if (run.status === 'done') {
        console.log('\n🎉 Backtest completed successfully!');
        
        // 3. Fetch and display results
        const results = await getResults(runId);
        
        if (results.length > 0) {
          console.log('\n📈 RESULTS SUMMARY:');
          console.log('='.repeat(60));
          
          let totalPnL = 0;
          let totalTrades = 0;
          let totalFees = 0;
          
          results.forEach(result => {
            totalPnL += result.pnl;
            totalTrades += result.trades;
            totalFees += result.fees;
            
            console.log(`${result.symbol}:`);
            console.log(`  • Trades: ${result.trades}`);
            console.log(`  • P&L: $${result.pnl.toFixed(0)} (${result.pnl >= 0 ? '✅' : '❌'})`);
            console.log(`  • Win Rate: ${result.win_rate.toFixed(1)}%`);
            console.log(`  • Max DD: ${(result.max_dd * 100).toFixed(1)}%`);
            console.log(`  • Sharpe: ${result.sharpe.toFixed(2)}`);
            console.log(`  • Profit Factor: ${result.profit_factor.toFixed(2)}`);
            console.log('');
          });
          
          console.log('='.repeat(60));
          console.log('TOTAL PORTFOLIO:');
          console.log(`  • Total P&L: $${totalPnL.toFixed(0)}`);
          console.log(`  • Total Return: ${((totalPnL / backtestConfig.starting_capital) * 100).toFixed(2)}%`);
          console.log(`  • Total Trades: ${totalTrades}`);
          console.log(`  • Total Fees: $${totalFees.toFixed(0)}`);
          console.log(`  • Net Profit: $${(totalPnL - totalFees).toFixed(0)}`);
          
          const successRate = results.filter(r => r.pnl > 0).length / results.length;
          console.log(`  • Symbol Success Rate: ${(successRate * 100).toFixed(0)}%`);
          
        } else {
          console.log('\n⚠️  No results found - check if backtest worker is running');
        }
        
        console.log('\n🔗 View detailed results at: http://localhost:3000/backtest/' + runId);
        break;
        
      } else if (run.status === 'error') {
        console.log('\n❌ Backtest failed with error:');
        console.log('   ', run.error || 'Unknown error');
        break;
        
      } else if (run.status === 'running') {
        console.log('   🔄 Processing...');
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⏰ Timeout waiting for results. Check the UI for status updates.');
    }
    
  } catch (error) {
    console.error('\n❌ Error running strategy:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure the Next.js app is running (npm run dev)');
    console.log('   2. Make sure the database is accessible');
    console.log('   3. Make sure the backtest worker is running');
    console.log('   4. Check the console for any error messages');
  }
}

// Add some helpful information
console.log('🎯 REGIME-FILTERED MOMENTUM STRATEGY');
console.log('=====================================');
console.log('Strategy Rules:');
console.log('• Regime: Only trade when price > EMA200 & ROC_1h > 0');
console.log('• Entry: 15m close above BB upper + vol_mult ≥ 3 + ROC_15m ≥ 0.6%');
console.log('• Risk: 0.3% per trade using ATR-based stops');
console.log('• Management: 50% profit at 1.2R, trail remaining 50%');
console.log('• Guards: Max 6bps spread, min 1.2 book imbalance, avoid funding');
console.log('• Kill Switch: Stop trading on -2% daily loss');
console.log('');

// Run the strategy
runRegimeFilteredMomentumStrategy();