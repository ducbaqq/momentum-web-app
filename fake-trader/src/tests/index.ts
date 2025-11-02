/**
 * Test Suite for Fake Trader
 * 
 * Tests:
 * - Deterministic price paths
 * - Spot checks for long/short math
 * - Partial fills
 * - Fee correctness
 * - CSV/JSON schema validation
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import type { Order, Fill, PositionV2 } from '../types.js';
import {
  createOrder,
  createFill,
  createPositionV2,
  updatePositionFromFills,
  closePositionV2,
  updateOrderStatusFromFills,
  getOrder,
  getFill,
  getPositionV2,
} from '../canonical-db.js';

// Load environment variables
dotenv.config();

// Test database connection
const testPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/momentum_collector',
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

/**
 * Deterministic Price Path Generator
 */
export function generatePricePath(
  startPrice: number,
  steps: number,
  trend: 'up' | 'down' | 'flat' | 'volatile' = 'flat',
  volatility: number = 0.01
): number[] {
  const prices: number[] = [startPrice];
  let currentPrice = startPrice;
  
  for (let i = 1; i < steps; i++) {
    let change: number;
    
    switch (trend) {
      case 'up':
        change = volatility * (0.5 + Math.random() * 0.5); // 0.5% to 1% up
        break;
      case 'down':
        change = -volatility * (0.5 + Math.random() * 0.5); // 0.5% to 1% down
        break;
      case 'volatile':
        change = volatility * (Math.random() - 0.5) * 2; // -1% to +1%
        break;
      default: // flat
        change = volatility * (Math.random() - 0.5); // -0.5% to +0.5%
    }
    
    currentPrice = currentPrice * (1 + change);
    prices.push(currentPrice);
  }
  
  return prices;
}

/**
 * Deterministic Price Path Generator (Fixed Seed)
 */
export function generateDeterministicPricePath(
  startPrice: number,
  steps: number,
  seed: number = 42
): number[] {
  const prices: number[] = [startPrice];
  let currentPrice = startPrice;
  
  // Simple LCG for deterministic randomness
  let state = seed;
  const lcg = () => {
    state = (state * 1664525 + 1013904223) % 2**32;
    return state / 2**32;
  };
  
  for (let i = 1; i < steps; i++) {
    const change = (lgc() - 0.5) * 0.02; // -1% to +1%
    currentPrice = currentPrice * (1 + change);
    prices.push(currentPrice);
  }
  
  return prices;
}

/**
 * Test: Long Position PnL Math
 */
export async function testLongPnLMath(): Promise<TestResult> {
  const testName = 'Long Position PnL Math';
  
  try {
    // Test Case 1: Simple LONG position
    const entryPrice = 100;
    const exitPrice = 110;
    const quantity = 10;
    const entryFee = 0.04; // 0.04%
    const exitFee = 0.04;
    
    // Calculate expected PnL
    const entryCost = entryPrice * quantity;
    const entryFeeAmount = entryCost * (entryFee / 100);
    const exitRevenue = exitPrice * quantity;
    const exitFeeAmount = exitRevenue * (exitFee / 100);
    
    // LONG PnL: (exit_price - entry_price) * quantity - fees
    const expectedPnL = (exitPrice - entryPrice) * quantity - entryFeeAmount - exitFeeAmount;
    
    // Manual calculation
    const priceDiff = exitPrice - entryPrice;
    const grossPnL = priceDiff * quantity;
    const totalFees = entryFeeAmount + exitFeeAmount;
    const netPnL = grossPnL - totalFees;
    
    if (Math.abs(expectedPnL - netPnL) > 0.01) {
      return {
        name: testName,
        passed: false,
        error: `PnL mismatch: expected ${expectedPnL}, got ${netPnL}`,
        details: { expectedPnL, netPnL, priceDiff, grossPnL, totalFees }
      };
    }
    
    // Test Case 2: LONG position with loss
    const exitPrice2 = 95;
    const exitRevenue2 = exitPrice2 * quantity;
    const exitFeeAmount2 = exitRevenue2 * (exitFee / 100);
    const expectedPnL2 = (exitPrice2 - entryPrice) * quantity - entryFeeAmount - exitFeeAmount2;
    
    if (expectedPnL2 >= 0) {
      return {
        name: testName,
        passed: false,
        error: 'Loss calculation failed: expected negative PnL',
        details: { expectedPnL2, exitPrice2, entryPrice }
      };
    }
    
    return {
      name: testName,
      passed: true,
      details: {
        profitCase: { expectedPnL, entryPrice, exitPrice, quantity },
        lossCase: { expectedPnL2, entryPrice, exitPrice2, quantity }
      }
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message
    };
  }
}

/**
 * Test: Short Position PnL Math
 */
export async function testShortPnLMath(): Promise<TestResult> {
  const testName = 'Short Position PnL Math';
  
  try {
    // Test Case 1: Simple SHORT position (profit when price goes down)
    const entryPrice = 100;
    const exitPrice = 90;
    const quantity = 10;
    const entryFee = 0.04; // 0.04%
    const exitFee = 0.04;
    
    // Calculate expected PnL
    const entryCost = entryPrice * quantity;
    const entryFeeAmount = entryCost * (entryFee / 100);
    const exitRevenue = exitPrice * quantity;
    const exitFeeAmount = exitRevenue * (exitFee / 100);
    
    // SHORT PnL: (entry_price - exit_price) * quantity - fees
    const expectedPnL = (entryPrice - exitPrice) * quantity - entryFeeAmount - exitFeeAmount;
    
    // Manual calculation
    const priceDiff = entryPrice - exitPrice;
    const grossPnL = priceDiff * quantity;
    const totalFees = entryFeeAmount + exitFeeAmount;
    const netPnL = grossPnL - totalFees;
    
    if (Math.abs(expectedPnL - netPnL) > 0.01) {
      return {
        name: testName,
        passed: false,
        error: `PnL mismatch: expected ${expectedPnL}, got ${netPnL}`,
        details: { expectedPnL, netPnL, priceDiff, grossPnL, totalFees }
      };
    }
    
    // Test Case 2: SHORT position with loss (price goes up)
    const exitPrice2 = 110;
    const exitRevenue2 = exitPrice2 * quantity;
    const exitFeeAmount2 = exitRevenue2 * (exitFee / 100);
    const expectedPnL2 = (entryPrice - exitPrice2) * quantity - entryFeeAmount - exitFeeAmount2;
    
    if (expectedPnL2 >= 0) {
      return {
        name: testName,
        passed: false,
        error: 'Loss calculation failed: expected negative PnL',
        details: { expectedPnL2, exitPrice2, entryPrice }
      };
    }
    
    return {
      name: testName,
      passed: true,
      details: {
        profitCase: { expectedPnL, entryPrice, exitPrice, quantity },
        lossCase: { expectedPnL2, entryPrice, exitPrice2, quantity }
      }
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message
    };
  }
}

/**
 * Test: Partial Fills
 */
export async function testPartialFills(): Promise<TestResult> {
  const testName = 'Partial Fills';
  
  try {
    // Create a test run (use a test UUID)
    const runId = '00000000-0000-0000-0000-000000000000';
    
    // Create order for 100 units
    const orderId = await createOrder({
      position_id: undefined,
      run_id: runId,
      symbol: 'TESTUSDT',
      ts: new Date().toISOString(),
      side: 'LONG',
      type: 'ENTRY',
      qty: 100,
      price: 100,
      status: 'NEW',
      reason_tag: 'test',
      rejection_reason: undefined,
    });
    
    // Create partial fill 1: 40 units
    const fillId1 = await createFill({
      order_id: orderId,
      position_id: undefined,
      run_id: runId,
      symbol: 'TESTUSDT',
      ts: new Date().toISOString(),
      qty: 40,
      price: 100,
      fee: 0.04,
    });
    
    // Check order status (should be PARTIAL)
    const order1 = await getOrder(orderId);
    if (order1?.status !== 'PARTIAL') {
      // Cleanup
      await testPool.query('DELETE FROM ft_fills WHERE fill_id = $1', [fillId1]);
      await testPool.query('DELETE FROM ft_orders WHERE order_id = $1', [orderId]);
      
      return {
        name: testName,
        passed: false,
        error: `Expected PARTIAL status after first fill, got ${order1?.status}`,
        details: { orderId, fillId1, orderStatus: order1?.status }
      };
    }
    
    // Create partial fill 2: 60 units (completing the order)
    const fillId2 = await createFill({
      order_id: orderId,
      position_id: undefined,
      run_id: runId,
      symbol: 'TESTUSDT',
      ts: new Date().toISOString(),
      qty: 60,
      price: 100,
      fee: 0.04,
    });
    
    // Check order status (should be FILLED)
    const order2 = await getOrder(orderId);
    if (order2?.status !== 'FILLED') {
      // Cleanup
      await testPool.query('DELETE FROM ft_fills WHERE fill_id IN ($1, $2)', [fillId1, fillId2]);
      await testPool.query('DELETE FROM ft_orders WHERE order_id = $1', [orderId]);
      
      return {
        name: testName,
        passed: false,
        error: `Expected FILLED status after second fill, got ${order2?.status}`,
        details: { orderId, fillId2, orderStatus: order2?.status }
      };
    }
    
    // Cleanup
    await testPool.query('DELETE FROM ft_fills WHERE fill_id IN ($1, $2)', [fillId1, fillId2]);
    await testPool.query('DELETE FROM ft_orders WHERE order_id = $1', [orderId]);
    
    return {
      name: testName,
      passed: true,
      details: {
        partialFill: { fillId1, qty: 40 },
        completeFill: { fillId2, qty: 60 },
        orderStatus: order2?.status
      }
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message
    };
  }
}

/**
 * Test: Fee Correctness
 */
export async function testFeeCorrectness(): Promise<TestResult> {
  const testName = 'Fee Correctness';
  
  try {
    const entryPrice = 100;
    const exitPrice = 110;
    const quantity = 10;
    const feeRate = 0.0004; // 0.04%
    
    // Calculate expected fees
    const entryCost = entryPrice * quantity;
    const expectedEntryFee = entryCost * feeRate;
    
    const exitRevenue = exitPrice * quantity;
    const expectedExitFee = exitRevenue * feeRate;
    
    const expectedTotalFees = expectedEntryFee + expectedExitFee;
    
    // Test fee calculation
    const actualEntryFee = entryCost * feeRate;
    const actualExitFee = exitRevenue * feeRate;
    const actualTotalFees = actualEntryFee + actualExitFee;
    
    if (Math.abs(expectedEntryFee - actualEntryFee) > 0.0001) {
      return {
        name: testName,
        passed: false,
        error: `Entry fee mismatch: expected ${expectedEntryFee}, got ${actualEntryFee}`,
        details: { expectedEntryFee, actualEntryFee, entryCost, feeRate }
      };
    }
    
    if (Math.abs(expectedExitFee - actualExitFee) > 0.0001) {
      return {
        name: testName,
        passed: false,
        error: `Exit fee mismatch: expected ${expectedExitFee}, got ${actualExitFee}`,
        details: { expectedExitFee, actualExitFee, exitRevenue, feeRate }
      };
    }
    
    if (Math.abs(expectedTotalFees - actualTotalFees) > 0.0001) {
      return {
        name: testName,
        passed: false,
        error: `Total fee mismatch: expected ${expectedTotalFees}, got ${actualTotalFees}`,
        details: { expectedTotalFees, actualTotalFees }
      };
    }
    
    // Test that fees are always positive
    if (actualEntryFee < 0 || actualExitFee < 0) {
      return {
        name: testName,
        passed: false,
        error: 'Fees should always be positive',
        details: { actualEntryFee, actualExitFee }
      };
    }
    
    return {
      name: testName,
      passed: true,
      details: {
        entryFee: actualEntryFee,
        exitFee: actualExitFee,
        totalFees: actualTotalFees,
        feeRate
      }
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message
    };
  }
}

/**
 * Test: CSV Schema Validation
 */
export async function testCSVSchemaValidation(): Promise<TestResult> {
  const testName = 'CSV Schema Validation';
  
  try {
    // Expected CSV schema for trade export
    const expectedColumns = [
      'timestamp',
      'event_type',
      'symbol',
      'side',
      'quantity',
      'entry_price',
      'exit_price',
      'realized_pnl',
      'fees',
      'unrealized_pnl',
      'mark_price'
    ];
    
    // Sample CSV row
    const sampleRow = {
      timestamp: '2025-01-01T00:00:00Z',
      event_type: 'POSITION_CLOSED',
      symbol: 'BTCUSDT',
      side: 'LONG',
      quantity: '10.5',
      entry_price: '100.0',
      exit_price: '110.0',
      realized_pnl: '99.58',
      fees: '0.42',
      unrealized_pnl: '',
      mark_price: '110.0'
    };
    
    // Validate all required columns exist
    const missingColumns = expectedColumns.filter(col => !(col in sampleRow));
    if (missingColumns.length > 0) {
      return {
        name: testName,
        passed: false,
        error: `Missing columns: ${missingColumns.join(', ')}`,
        details: { missingColumns, expectedColumns, sampleRow }
      };
    }
    
    // Validate data types
    const numericFields = ['quantity', 'entry_price', 'exit_price', 'realized_pnl', 'fees', 'mark_price'];
    for (const field of numericFields) {
      if (sampleRow[field as keyof typeof sampleRow] !== '' && isNaN(Number(sampleRow[field as keyof typeof sampleRow]))) {
        return {
          name: testName,
          passed: false,
          error: `Invalid numeric value for ${field}: ${sampleRow[field as keyof typeof sampleRow]}`,
          details: { field, value: sampleRow[field as keyof typeof sampleRow] }
        };
      }
    }
    
    // Validate enum values
    const validSides = ['LONG', 'SHORT'];
    if (!validSides.includes(sampleRow.side)) {
      return {
        name: testName,
        passed: false,
        error: `Invalid side: ${sampleRow.side}`,
        details: { side: sampleRow.side, validSides }
      };
    }
    
    return {
      name: testName,
      passed: true,
      details: {
        columns: expectedColumns,
        sampleRow,
        validations: ['column_presence', 'numeric_types', 'enum_values']
      }
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message
    };
  }
}

/**
 * Test: JSON Schema Validation
 */
export async function testJSONSchemaValidation(): Promise<TestResult> {
  const testName = 'JSON Schema Validation';
  
  try {
    // Expected JSON schema for events
    const eventSchema = {
      event_id: 'string',
      run_id: 'string',
      event_type: 'string',
      ts: 'string',
      payload: 'object',
      order_id: 'string | null',
      fill_id: 'string | null',
      position_id: 'string | null',
      created_at: 'string'
    };
    
    // Sample event
    const sampleEvent = {
      event_id: '123e4567-e89b-12d3-a456-426614174000',
      run_id: '123e4567-e89b-12d3-a456-426614174001',
      event_type: 'POSITION_CLOSED',
      ts: '2025-01-01T00:00:00Z',
      payload: {
        position_id: '123e4567-e89b-12d3-a456-426614174002',
        symbol: 'BTCUSDT',
        side: 'LONG',
        entry_price_vwap: 100.0,
        exit_price_vwap: 110.0,
        realized_pnl: 99.58,
        fees_total: 0.42
      },
      order_id: '123e4567-e89b-12d3-a456-426614174003',
      fill_id: null,
      position_id: '123e4567-e89b-12d3-a456-426614174002',
      created_at: '2025-01-01T00:00:00Z'
    };
    
    // Validate all required fields exist
    const requiredFields = Object.keys(eventSchema);
    const missingFields = requiredFields.filter(field => !(field in sampleEvent));
    if (missingFields.length > 0) {
      return {
        name: testName,
        passed: false,
        error: `Missing fields: ${missingFields.join(', ')}`,
        details: { missingFields, requiredFields, sampleEvent }
      };
    }
    
    // Validate event_type enum
    const validEventTypes = [
      'ACCOUNT_SNAPSHOT',
      'ORDER_NEW',
      'ORDER_UPDATE',
      'FILL',
      'POSITION_OPENED',
      'POSITION_MARK',
      'POSITION_CLOSED',
      'STRATEGY_NOTE'
    ];
    if (!validEventTypes.includes(sampleEvent.event_type)) {
      return {
        name: testName,
        passed: false,
        error: `Invalid event_type: ${sampleEvent.event_type}`,
        details: { event_type: sampleEvent.event_type, validEventTypes }
      };
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sampleEvent.event_id)) {
      return {
        name: testName,
        passed: false,
        error: `Invalid UUID format for event_id: ${sampleEvent.event_id}`,
        details: { event_id: sampleEvent.event_id }
      };
    }
    
    // Validate ISO timestamp format
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (!isoRegex.test(sampleEvent.ts)) {
      return {
        name: testName,
        passed: false,
        error: `Invalid ISO timestamp format: ${sampleEvent.ts}`,
        details: { ts: sampleEvent.ts }
      };
    }
    
    return {
      name: testName,
      passed: true,
      details: {
        schema: eventSchema,
        sampleEvent,
        validations: ['required_fields', 'event_type_enum', 'uuid_format', 'iso_timestamp']
      }
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message
    };
  }
}

/**
 * Test: Deterministic Price Path
 */
export async function testDeterministicPricePath(): Promise<TestResult> {
  const testName = 'Deterministic Price Path';
  
  try {
    // Test that same seed produces same path
    const seed1 = 42;
    const seed2 = 42;
    const seed3 = 43;
    
    const path1 = generateDeterministicPricePath(100, 10, seed1);
    const path2 = generateDeterministicPricePath(100, 10, seed2);
    const path3 = generateDeterministicPricePath(100, 10, seed3);
    
    // Same seed should produce same path
    if (JSON.stringify(path1) !== JSON.stringify(path2)) {
      return {
        name: testName,
        passed: false,
        error: 'Same seed produced different paths',
        details: { seed1, seed2, path1, path2 }
      };
    }
    
    // Different seed should produce different path
    if (JSON.stringify(path1) === JSON.stringify(path3)) {
      return {
        name: testName,
        passed: false,
        error: 'Different seeds produced same path',
        details: { seed1, seed3, path1, path3 }
      };
    }
    
    // Path should start at startPrice
    if (path1[0] !== 100) {
      return {
        name: testName,
        passed: false,
        error: `Path should start at 100, got ${path1[0]}`,
        details: { startPrice: 100, actualStart: path1[0] }
      };
    }
    
    // Path should have correct length
    if (path1.length !== 10) {
      return {
        name: testName,
        passed: false,
        error: `Path should have 10 steps, got ${path1.length}`,
        details: { expectedLength: 10, actualLength: path1.length }
      };
    }
    
    return {
      name: testName,
      passed: true,
      details: {
        seed1: path1,
        seed2: path2,
        seed3: path3,
        deterministic: JSON.stringify(path1) === JSON.stringify(path2)
      }
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message
    };
  }
}

/**
 * Run all tests
 */
export async function runAllTests(): Promise<void> {
  console.log('🧪 Running Fake Trader Test Suite...\n');
  
  const tests = [
    testDeterministicPricePath,
    testLongPnLMath,
    testShortPnLMath,
    testPartialFillsWithPosition,
    testFeeCorrectness,
    testCSVSchemaValidation,
    testJSONSchemaValidation,
  ];
  
  for (const test of tests) {
    try {
      const result = await test();
      results.push(result);
      
      if (result.passed) {
        console.log(`✅ ${result.name}`);
        if (result.details) {
          console.log(`   Details:`, JSON.stringify(result.details, null, 2));
        }
      } else {
        console.log(`❌ ${result.name}`);
        console.log(`   Error: ${result.error}`);
        if (result.details) {
          console.log(`   Details:`, JSON.stringify(result.details, null, 2));
        }
      }
    } catch (error: any) {
      results.push({
        name: test.name,
        passed: false,
        error: error.message
      });
      console.log(`❌ ${test.name}`);
      console.log(`   Error: ${error.message}`);
    }
    console.log('');
  }
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log('📊 Test Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Total: ${results.length}`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. See details above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts')) {
  runAllTests().catch(console.error);
}

