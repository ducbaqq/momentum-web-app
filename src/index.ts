#!/usr/bin/env node
// index.ts - Binance Momentum Web Dashboard
// 
// This service provides a web interface for viewing momentum data:
// - Reads historical and live data from PostgreSQL
// - Displays real-time dashboard with symbol status
// - Shows recent signals and market activity
// - Connects to collector API for system status
// - Optimized for user experience and variable load

import { config, validateConfig, log } from './config.js';
import { initDatabase } from './db.js';
import { EventEmitter, WebServer } from './ui.js';

/* =========================
   Main Application
   ========================= */
async function main(): Promise<void> {
  log('🌐 Starting Binance Momentum Web Dashboard');
  
  // 1. Validate configuration
  const configErrors = validateConfig();
  if (configErrors.length > 0) {
    log('❌ Configuration errors:');
    configErrors.forEach(error => log(`  - ${error}`));
    process.exit(1);
  }
  
  log(`📊 Dashboard for symbols: ${config.symbols.join(', ')}`);
  log(`🔗 Collector API: ${config.collector.apiUrl}`);
  
  // 2. Initialize database connection (required for web app)
  const dbConnected = await initDatabase();
  if (!dbConnected) {
    log('❌ Database connection required for web app');
    process.exit(1);
  }
  
  // 3. Set up event system for live updates
  const eventEmitter = new EventEmitter();
  
  // 4. Start web server
  const webServer = new WebServer(eventEmitter);
  await webServer.start();
  
  // 5. Graceful shutdown handling
  const gracefulShutdown = (signal: string): void => {
    log(`📥 Received ${signal}, shutting down gracefully...`);
    
    try { webServer.close(); } catch {}
    
    log('👋 Web dashboard stopped');
    process.exit(0);
  };
  
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  log('🎯 Web dashboard started successfully');
  log(`🌐 Dashboard: http://${config.server.host}:${config.server.port}`);
}

/* =========================
   Error Handling & Startup
   ========================= */
main().catch((error: Error) => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
