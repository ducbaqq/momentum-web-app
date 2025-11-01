import dotenv from 'dotenv';
import { FakeTrader } from './fake-trader.js';

// Load environment variables
dotenv.config();

// Start the fake trader
const trader = new FakeTrader();
trader.start().catch(error => {
  console.error('💥 Failed to start fake trader:', error);
  process.exit(1);
});