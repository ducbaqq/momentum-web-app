# Setting Up Regime-Filtered Momentum Strategy

## Current UI Status ❌

The current UI is **NOT ready** for your sophisticated strategy. It only supports basic momentum breakout parameters:

### Current UI Parameters:
- ✅ Basic momentum (ROC 5m, volume multiplier) 
- ✅ Spread constraints
- ✅ Fee/slippage settings
- ❌ **Missing**: Regime filters (EMA200, ROC_1h)
- ❌ **Missing**: 15m timeframe parameters
- ❌ **Missing**: ATR-based stops
- ❌ **Missing**: Partial takes & trailing stops
- ❌ **Missing**: Book imbalance guards
- ❌ **Missing**: Daily kill switch
- ❌ **Missing**: Funding minute avoidance

## ✅ **Quick Setup Options**

### Option 1: Direct API Call (Immediate)
You can run your strategy **right now** using the API directly:

```bash
curl -X POST http://localhost:3000/api/backtest/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Regime Filtered Momentum Test",
    "start_ts": "2024-01-01T00:00:00Z",
    "end_ts": "2024-01-31T23:59:59Z",
    "symbols": ["BTCUSDT"],
    "timeframe": "15m",
    "strategy_name": "regime_filtered_momentum",
    "strategy_version": "1.0",
    "starting_capital": 10000,
    "params": {
      "emaLength": 200,
      "rocPositive": true,
      "minVolMult15m": 3.0,
      "minRoc15m": 0.006,
      "bbTrigger": true,
      "riskPerTrade": 0.003,
      "atrPeriod": 14,
      "atrMultiplier": 2.0,
      "partialTakeLevel": 1.2,
      "partialTakePercent": 0.5,
      "trailAfterPartial": true,
      "maxSpreadBps": 6,
      "minBookImbalance": 1.2,
      "avoidFundingMinute": true,
      "killSwitchPercent": 0.02,
      "maxConcurrentPositions": 3,
      "leverage": 1
    }
  }'
```

### Option 2: Node.js Script (Recommended)
Create a script to run your strategy:

```javascript
// run-regime-strategy.js
const config = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframe: '15m',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  initialBalance: 10000,
  
  // Your exact strategy parameters
  strategyParams: {
    // Regime: 1h EMA200 filter + ROC_1h sign
    emaLength: 200,
    rocPositive: true,
    
    // Trigger: 15m close above BB upper with vol_mult_15m ≥ 3 and ROC_15m ≥ 0.6%
    minVolMult15m: 3.0,
    minRoc15m: 0.006,  // 0.6%
    bbTrigger: true,
    
    // Risk: 0.3%/trade, ATR(15m,14)-based stop, partial at 1.2R, trail rest
    riskPerTrade: 0.003,  // 0.3%
    atrPeriod: 14,
    atrMultiplier: 2.0,
    partialTakeLevel: 1.2,
    partialTakePercent: 0.5,
    trailAfterPartial: true,
    
    // Guards: spread_bps ≤ 6, book_imb ≥ 1.2, avoid funding minute, kill switch on −2% day
    maxSpreadBps: 6,
    minBookImbalance: 1.2,
    avoidFundingMinute: true,
    killSwitchPercent: 0.02
  }
};

async function runRegimeStrategy() {
  const response = await fetch('http://localhost:3000/api/backtest/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: "Regime Filtered Momentum",
      start_ts: config.startDate + "T00:00:00Z",
      end_ts: config.endDate + "T23:59:59Z",
      symbols: config.symbols,
      timeframe: config.timeframe,
      strategy_name: "regime_filtered_momentum",
      params: config.strategyParams,
      starting_capital: config.initialBalance
    })
  });
  
  const result = await response.json();
  console.log('Backtest queued:', result);
}

runRegimeStrategy();
```

### Option 3: Enhanced UI (Requires Development)
To properly support your strategy in the UI, we need to add:

1. **Regime Filter Section**:
   ```tsx
   <div className="regime-filters">
     <input type="number" placeholder="EMA Length" value={200} />
     <checkbox>Require Positive ROC 1h</checkbox>
   </div>
   ```

2. **Advanced Risk Management**:
   ```tsx
   <div className="risk-management">
     <input type="number" placeholder="Risk Per Trade %" value={0.3} />
     <input type="number" placeholder="ATR Period" value={14} />
     <input type="number" placeholder="ATR Multiplier" value={2.0} />
     <input type="number" placeholder="Partial Take Level" value={1.2} />
     <checkbox>Trail After Partial</checkbox>
   </div>
   ```

3. **Guard Conditions**:
   ```tsx
   <div className="guards">
     <input type="number" placeholder="Max Spread (bps)" value={6} />
     <input type="number" placeholder="Min Book Imbalance" value={1.2} />
     <checkbox>Avoid Funding Minutes</checkbox>
     <input type="number" placeholder="Daily Kill Switch %" value={2} />
   </div>
   ```

## 🚀 **Immediate Action Plan**

1. **Run Strategy Now** using Option 2 (Node.js script)
2. **Monitor Results** in the existing UI (results will show up in backtest runs)
3. **Enhance UI Later** if you want better parameter control

## 📊 **Expected Strategy Behavior**

Your strategy will:

✅ **Entry**: Only when BTC/ETH is in uptrend (above EMA200) with positive 1h momentum
✅ **Trigger**: 15m Bollinger breakout with 3x volume and 0.6%+ momentum  
✅ **Risk**: Exact 0.3% risk per trade using ATR stops
✅ **Management**: 50% profit take at 1.2R, trail the rest
✅ **Guards**: Skip trades with wide spreads, poor book depth, or near funding
✅ **Protection**: Auto-stop trading if daily loss hits 2%

## 🎯 **Next Steps**

1. **Test the strategy** using the API/script method
2. **Review results** in the UI 
3. **Iterate parameters** based on performance
4. **Enhance UI** if you want easier parameter adjustment

Would you like me to create the Node.js script for immediate testing, or would you prefer to enhance the UI first?