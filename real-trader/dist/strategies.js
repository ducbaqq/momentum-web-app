import { PositionSide, OrderType } from './types.js';
// Momentum Breakout Strategy (Basic)
export function momentumBreakoutStrategy(candle, state, params) {
    const signals = [];
    // Get required parameters
    const minRoc5m = params.minRoc5m || 1.2;
    const minVolMult = params.minVolMult || 3;
    const maxSpreadBps = params.maxSpreadBps || 10;
    const leverage = params.leverage || 1;
    // Check if we already have a position for this symbol
    const existingPosition = state.positions.find(p => p.symbol === state.symbol && p.status === 'open');
    if (existingPosition) {
        // Check exit conditions
        const momentumLost = (candle.roc_1m ?? 0) < 0;
        const rsiOverbought = (candle.rsi_14 ?? 50) > 75;
        if (momentumLost || rsiOverbought) {
            signals.push({
                symbol: state.symbol,
                side: existingPosition.side === PositionSide.LONG ? PositionSide.SHORT : PositionSide.LONG,
                size: Math.abs(existingPosition.size),
                type: OrderType.MARKET,
                reason: momentumLost ? 'momentum_loss' : 'rsi_overbought',
                leverage
            });
        }
    }
    else {
        // Check entry conditions
        const roc5m = candle.roc_5m ?? 0;
        const volMult = candle.vol_mult ?? 1;
        const spreadBps = candle.spread_bps ?? 0;
        const momentumOk = roc5m >= minRoc5m;
        const volumeOk = volMult >= minVolMult;
        const spreadOk = spreadBps <= maxSpreadBps;
        if (momentumOk && volumeOk && spreadOk) {
            // Calculate position size (20% of capital)
            const riskAmount = state.currentCapital * 0.20;
            const size = riskAmount / candle.close;
            signals.push({
                symbol: state.symbol,
                side: PositionSide.LONG,
                size: size,
                type: OrderType.MARKET,
                stopLoss: candle.close * 0.98,
                takeProfit: candle.close * 1.03,
                leverage,
                reason: 'momentum_breakout'
            });
        }
    }
    return signals;
}
// Momentum Breakout V2 Strategy (Professional)
export function momentumBreakoutV2Strategy(candle, state, params) {
    const signals = [];
    // Get required parameters
    const minRoc5m = params.minRoc5m || 1.2;
    const minVolMult = params.minVolMult || 3;
    const maxSpreadBps = params.maxSpreadBps || 10;
    const leverage = params.leverage || 1;
    const riskPct = 20; // Risk 20% of equity per trade
    const rsiExitLevel = 75;
    // Validate required data is available
    const roc5m = candle.roc_5m ?? 0;
    const volMult = candle.vol_mult ?? 1;
    const spreadBps = candle.spread_bps ?? 0;
    const existingPosition = state.positions.find(p => p.symbol === state.symbol && p.status === 'open');
    if (existingPosition) {
        // Check exit conditions
        const momentumLost = (candle.roc_1m ?? 0) < 0;
        const rsiOverbought = (candle.rsi_14 ?? 50) > rsiExitLevel;
        if (momentumLost || rsiOverbought) {
            signals.push({
                symbol: state.symbol,
                side: existingPosition.side === PositionSide.LONG ? PositionSide.SHORT : PositionSide.LONG,
                size: Math.abs(existingPosition.size),
                type: OrderType.MARKET,
                reason: momentumLost ? 'momentum_loss' : 'rsi_overbought',
                leverage
            });
        }
    }
    else {
        // Check entry conditions
        const momentumOk = roc5m >= minRoc5m;
        const volumeOk = volMult >= minVolMult;
        const spreadOk = spreadBps <= maxSpreadBps;
        if (momentumOk && volumeOk && spreadOk) {
            console.log(`[${state.symbol}] 🚀 ENTRY SIGNAL: roc5m=${roc5m}%, volMult=${volMult}x, spread=${spreadBps}bps`);
            // Calculate position size based on risk percentage
            const riskAmount = state.currentCapital * (riskPct / 100);
            const positionNotional = riskAmount * leverage;
            const positionSize = positionNotional / candle.close;
            signals.push({
                symbol: state.symbol,
                side: PositionSide.LONG,
                size: positionSize,
                type: OrderType.MARKET,
                leverage,
                reason: 'momentum_breakout_v2'
            });
        }
    }
    return signals;
}
// Regime Filtered Momentum Strategy (Advanced)
export function regimeFilteredMomentumStrategy(candle, state, params) {
    const signals = [];
    // Get required parameters
    const emaLength = params.emaLength || 200;
    const rocPositive = params.rocPositive !== false;
    const minVolMult15m = params.minVolMult15m || 3.0;
    const minRoc15m = params.minRoc15m || 0.006;
    const bbTrigger = params.bbTrigger !== false;
    const riskPerTrade = params.riskPerTrade || 0.003;
    const leverage = params.leverage || 1;
    // Basic regime filter (using ema_50 as proxy since we don't have ema_200)
    const ema200 = candle.ema_50 || candle.close;
    const roc1h = candle.roc_1h || 0;
    // Check regime conditions
    const priceAboveEma = candle.close > ema200;
    const positiveRoc = !rocPositive || roc1h > 0;
    const inRegime = priceAboveEma && positiveRoc;
    if (!inRegime) {
        return signals; // No trades outside of favorable regime
    }
    const existingPosition = state.positions.find(p => p.symbol === state.symbol && p.status === 'open');
    if (existingPosition) {
        // Exit conditions - exit if regime breaks or stop loss hit
        if (!inRegime) {
            signals.push({
                symbol: state.symbol,
                side: existingPosition.side === PositionSide.LONG ? PositionSide.SHORT : PositionSide.LONG,
                size: Math.abs(existingPosition.size),
                type: OrderType.MARKET,
                reason: 'regime_exit',
                leverage
            });
        }
    }
    else {
        // Entry trigger conditions
        const roc15m = candle.roc_15m || 0;
        const volMult = candle.vol_mult || 1;
        const bbUpper = candle.bb_upper || candle.close * 1.02;
        const volumeCondition = volMult >= minVolMult15m;
        const momentumCondition = roc15m >= minRoc15m;
        const breakoutCondition = !bbTrigger || candle.close > bbUpper;
        if (volumeCondition && momentumCondition && breakoutCondition) {
            const riskAmount = state.currentCapital * riskPerTrade;
            const size = riskAmount / candle.close;
            signals.push({
                symbol: state.symbol,
                side: PositionSide.LONG,
                size: size,
                type: OrderType.MARKET,
                stopLoss: candle.close * 0.98,
                takeProfit: candle.close * 1.03,
                leverage,
                reason: 'regime_filtered_momentum'
            });
        }
    }
    return signals;
}
// Strategy factory
export function getStrategy(strategyName) {
    switch (strategyName) {
        case 'momentum_breakout':
            return momentumBreakoutStrategy;
        case 'momentum_breakout_v2':
            return momentumBreakoutV2Strategy;
        case 'regime_filtered_momentum':
            return regimeFilteredMomentumStrategy;
        default:
            throw new Error(`Unknown strategy: ${strategyName}`);
    }
}
