// Test script to simulate and debug chart behavior
const https = require('https');

async function testChartAPI() {
  console.log('=== Testing Chart API Behavior ===\n');
  
  // Test 1: Test the chart API endpoint
  const url = 'http://localhost:3001/api/backtest/chart?symbol=ATOMUSDT&tf=15m&start_date=2025-08-12T10:00:00.000Z&end_date=2025-08-12T16:00:00.000Z&limit=100';
  
  try {
    console.log('1. Testing chart API endpoint...');
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('API Response Status:', response.status);
    console.log('API Response Keys:', Object.keys(data));
    console.log('Candles Count:', data.candles?.length || 0);
    
    if (data.candles && data.candles.length > 0) {
      console.log('Sample candle:', JSON.stringify(data.candles[0], null, 2));
      
      // Test the data format that the chart expects
      console.log('\n2. Testing data format conversion...');
      const formattedCandle = {
        time: data.candles[0].time,
        open: Number(data.candles[0].open),
        high: Number(data.candles[0].high), 
        low: Number(data.candles[0].low),
        close: Number(data.candles[0].close),
      };
      console.log('Formatted for chart:', JSON.stringify(formattedCandle, null, 2));
      
      // Test timestamp conversion
      const timestamp = data.candles[0].time;
      const date = new Date(timestamp * 1000);
      console.log('Timestamp:', timestamp);
      console.log('Converted Date:', date.toISOString());
      
    } else {
      console.log('❌ No candle data returned');
    }
  } catch (error) {
    console.error('❌ API test failed:', error.message);
  }

  console.log('\n3. Testing lightweight-charts compatibility...');
  
  // Test if we can import the library in Node context
  try {
    const lightweightCharts = require('lightweight-charts');
    console.log('✅ lightweight-charts can be required');
    console.log('Available exports:', Object.keys(lightweightCharts));
  } catch (error) {
    console.log('⚠️  lightweight-charts not available in Node context (expected)');
    console.log('Error:', error.message);
  }

  console.log('\n=== Chart API Test Complete ===');
}

testChartAPI().catch(console.error);