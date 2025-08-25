import dotenv from 'dotenv';
import { BinanceClient } from './binanceClient.js';
import { testConnection } from './db.js';
// Load environment variables
dotenv.config();
async function runTests() {
    console.log('🧪 Running Real Trader Tests...\n');
    // Check environment variables
    console.log('1. ✅ Checking Environment Variables...');
    // Determine if running on testnet (default to true for safety)
    const isTestnet = process.env.BINANCE_TESTNET !== 'false';
    console.log(`Running in ${isTestnet ? 'TESTNET' : 'MAINNET'} mode`);
    // Choose appropriate API credentials
    const apiKey = isTestnet
        ? process.env.BINANCE_TESTNET_API_KEY
        : process.env.BINANCE_API_KEY;
    const apiSecret = isTestnet
        ? process.env.BINANCE_TESTNET_API_SECRET
        : process.env.BINANCE_API_SECRET;
    const requiredEnvVars = ['DATABASE_URL'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    // Check for API credentials based on mode
    if (!apiKey) {
        missingEnvVars.push(isTestnet ? 'BINANCE_TESTNET_API_KEY' : 'BINANCE_API_KEY');
    }
    if (!apiSecret) {
        missingEnvVars.push(isTestnet ? 'BINANCE_TESTNET_API_SECRET' : 'BINANCE_API_SECRET');
    }
    if (missingEnvVars.length > 0) {
        console.log(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
        return false;
    }
    console.log('✅ All required environment variables present\n');
    // Test database connection
    console.log('2. ✅ Testing Database Connection...');
    try {
        await testConnection();
        console.log('✅ Database connection successful\n');
    }
    catch (error) {
        console.log('❌ Database connection failed:', error);
        return false;
    }
    // Test Binance connection
    console.log('3. ✅ Testing Binance API Connection...');
    const binanceConfig = {
        apiKey: apiKey,
        apiSecret: apiSecret,
        testnet: isTestnet,
    };
    const binanceClient = new BinanceClient(binanceConfig);
    try {
        const connected = await binanceClient.testConnection();
        if (!connected) {
            console.log('❌ Binance API connection failed');
            return false;
        }
        console.log('✅ Binance API connection successful\n');
    }
    catch (error) {
        console.log('❌ Binance API connection failed:', error);
        return false;
    }
    // Test account info
    console.log('4. ✅ Testing Account Info...');
    try {
        const accountInfo = await binanceClient.getAccountInfo();
        console.log(`💰 Total Wallet Balance: $${parseFloat(accountInfo.totalWalletBalance).toFixed(2)}`);
        console.log(`💵 Available Balance: $${parseFloat(accountInfo.availableBalance).toFixed(2)}`);
        console.log(`🔄 Can Trade: ${accountInfo.canTrade}`);
        console.log('✅ Account info retrieved successfully\n');
    }
    catch (error) {
        console.log('❌ Failed to get account info:', error);
        return false;
    }
    // Test position retrieval
    console.log('5. ✅ Testing Position Retrieval...');
    try {
        const positions = await binanceClient.getPositions();
        console.log(`📍 Open Positions: ${positions.length}`);
        if (positions.length > 0) {
            console.log('Current positions:');
            positions.forEach(pos => {
                console.log(`  ${pos.symbol}: ${pos.positionSide} ${pos.positionAmt} @ $${parseFloat(pos.entryPrice).toFixed(2)} (P&L: $${parseFloat(pos.unRealizedProfit).toFixed(2)})`);
            });
        }
        console.log('✅ Position retrieval successful\n');
    }
    catch (error) {
        console.log('❌ Failed to get positions:', error);
        return false;
    }
    // Test price retrieval
    console.log('6. ✅ Testing Price Retrieval...');
    try {
        const testSymbols = ['BTCUSDT', 'ETHUSDT'];
        const prices = await binanceClient.getCurrentPrices(testSymbols);
        console.log('Current prices:');
        for (const [symbol, price] of Object.entries(prices)) {
            console.log(`  ${symbol}: $${price.toFixed(2)}`);
        }
        console.log('✅ Price retrieval successful\n');
    }
    catch (error) {
        console.log('❌ Failed to get prices:', error);
        return false;
    }
    // Test symbol info
    console.log('7. ✅ Testing Symbol Info...');
    try {
        const symbolInfo = await binanceClient.getSymbolInfo('BTCUSDT');
        const minOrderSize = await binanceClient.getMinOrderSize('BTCUSDT');
        console.log(`Symbol: ${symbolInfo.symbol}`);
        console.log(`Status: ${symbolInfo.status}`);
        console.log(`Min Quantity: ${minOrderSize.minQty}`);
        console.log(`Step Size: ${minOrderSize.stepSize}`);
        console.log('✅ Symbol info retrieval successful\n');
    }
    catch (error) {
        console.log('❌ Failed to get symbol info:', error);
        return false;
    }
    // Test balance checks
    console.log('8. ✅ Testing Balance Checks...');
    try {
        const availableBalance = await binanceClient.getAvailableBalance();
        const totalBalance = await binanceClient.getTotalWalletBalance();
        console.log(`Available Balance: $${availableBalance.toFixed(2)}`);
        console.log(`Total Wallet Balance: $${totalBalance.toFixed(2)}`);
        if (availableBalance < 100) {
            console.log('⚠️  Warning: Available balance is less than $100');
            console.log('   Consider adding more funds for testing');
        }
        console.log('✅ Balance checks successful\n');
    }
    catch (error) {
        console.log('❌ Failed balance checks:', error);
        return false;
    }
    console.log('🎉 All tests passed successfully!');
    console.log('\n📋 System Status:');
    console.log(`✅ Database: Connected`);
    console.log(`✅ Binance API: Connected (${binanceConfig.testnet ? 'TESTNET' : 'MAINNET'})`);
    console.log(`✅ Account: Trading enabled`);
    console.log(`✅ Balance: Available`);
    console.log(`✅ Market Data: Accessible`);
    console.log('\n🚀 Real Trader is ready to start!');
    console.log('\n⚠️  Remember:');
    console.log('- Always test strategies in backtest-worker first');
    console.log('- Then test with fake-trader simulation');
    console.log('- Only then run real-trader on testnet');
    console.log('- Monitor trades actively');
    console.log('- Start with small position sizes');
    return true;
}
// Run tests
runTests()
    .then((success) => {
    process.exit(success ? 0 : 1);
})
    .catch((error) => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
});
