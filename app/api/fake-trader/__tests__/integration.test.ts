import { NextRequest } from 'next/server';

// Mock the database
jest.mock('@/lib/db', () => {
  const mockQuery = jest.fn();
  const mockConnect = jest.fn();
  
  return {
    pool: {
      query: mockQuery,
      connect: mockConnect,
    },
    tradingPool: {
      query: mockQuery,
      connect: mockConnect,
    },
    dataPool: {
      query: mockQuery,
      connect: mockConnect,
    },
  };
});

const mockDb = require('@/lib/db');
const mockPool = mockDb.tradingPool;

describe('Fake Trader API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Run Creation Flow', () => {
    it('should create a new run successfully', async () => {
      const { POST } = await import('@/app/api/fake-trader/create/route');
      
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              run_id: 'new-run-id',
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // Initialize results

      const req = new NextRequest('http://localhost:3000/api/fake-trader/create', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Test Run',
          symbols: ['BTCUSDT'],
          timeframe: '15m',
          strategy_name: 'momentum_breakout_v2',
          strategy_version: '1.0',
          starting_capital: 10000,
          max_concurrent_positions: 3,
          params: { minRoc5m: 0.5 },
          seed: 12345,
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.run_id).toBe('new-run-id');
    });

    it('should reject invalid run creation', async () => {
      const { POST } = await import('@/app/api/fake-trader/create/route');
      
      const req = new NextRequest('http://localhost:3000/api/fake-trader/create', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Invalid Run',
          // Missing required fields
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });
  });

  describe('Run Status Update Flow', () => {
    it('should update run status to paused', async () => {
      const { PATCH } = await import('@/app/api/fake-trader/runs/[runId]/route');
      
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            run_id: 'test-run-1',
            status: 'paused',
            name: 'Test Run',
          },
        ],
      });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs/test-run-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paused' }),
      });

      const response = await PATCH(req, { params: { runId: 'test-run-1' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('paused');
    });

    it('should reject invalid status', async () => {
      const { PATCH } = await import('@/app/api/fake-trader/runs/[runId]/route');
      
      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs/test-run-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'invalid_status' }),
      });

      const response = await PATCH(req, { params: { runId: 'test-run-1' } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid status');
    });
  });

  describe('Data Consistency Tests', () => {
    it('should maintain consistency between equity and cash + margin', async () => {
      const { GET } = await import('@/app/api/fake-trader/runs/[runId]/route');
      
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              run_id: 'test-run-1',
              name: 'Test Run',
              symbols: ['BTCUSDT'],
              timeframe: '15m',
              strategy_name: 'momentum_breakout_v2',
              strategy_version: '1.0',
              params: {},
              seed: 12345,
              status: 'active',
              starting_capital: 10000,
              current_capital: 10500,
              max_concurrent_positions: 3,
              started_at: '2025-01-01T00:00:00Z',
              last_update: '2025-01-01T01:00:00Z',
              stopped_at: null,
              error: null,
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              equity: 10500,
              cash: 8000,
              margin_used: 2500,
              exposure_gross: 2500,
              exposure_net: 2500,
              open_positions_count: 1,
              ts: '2025-01-01T01:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              total_realized_pnl: 200,
              total_fees: 50,
            },
          ],
        });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs/test-run-1');
      const response = await GET(req, { params: { runId: 'test-run-1' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      // Equity should equal cash + margin_used (approximately)
      expect(data.run.equity).toBeGreaterThanOrEqual(data.run.cash + data.run.margin_used);
    });
  });
});

