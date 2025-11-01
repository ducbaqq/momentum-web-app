import dotenv from 'dotenv';
import { RealTrader } from './real-trader.js';
import type { BinanceConfig } from './types.js';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });
dotenv.config(); // Also load from current directory if exists

// Main execution
async function main() {
  // Determine if running on testnet (default to true for safety)
  const isTestnet = process.env.BINANCE_TESTNET !== 'false';

  // Choose appropriate API credentials
  const apiKey = isTestnet
    ? process.env.BINANCE_GITHUB_TESTNET_API_KEY
    : process.env.BINANCE_API_KEY;
  const apiSecret = isTestnet
    ? process.env.BINANCE_GITHUB_TESTNET_API_SECRET
    : process.env.BINANCE_API_SECRET;

  // Validate required environment variables
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
    console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  const binanceConfig: BinanceConfig = {
    apiKey: apiKey!,
    apiSecret: apiSecret!,
    testnet: isTestnet,
  };

  const trader = new RealTrader(binanceConfig);

  try {
    await trader.start();
  } catch (error) {
    console.error('💥 Failed to start real trader:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Unhandled error in main:', error);
  process.exit(1);
});