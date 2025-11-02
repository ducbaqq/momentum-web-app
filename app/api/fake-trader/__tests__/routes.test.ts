import { NextRequest } from 'next/server';

// Mock the database pool
jest.mock('@/lib/db', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

// Mock database connection
const mockPool = require('@/lib/db').pool;

describe('Fake Trader API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/fake-trader/runs', () => {
    it('should return runs with canonical model metrics', async () => {
      const { GET } = await import('@/app/api/fake-trader/runs/route');
      
      // Mock database responses
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              run_id: 'test-run-1',
              name: 'Test Run',
              symbols: ['BTCUSDT', 'ETHUSDT'],
              timeframe: '15m',
              strategy_name: 'momentum_breakout_v2',
              strategy_version: '1.0',
              params: { minRoc5m: 0.5 },
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
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              position_id: 'pos-1',
              symbol: 'BTCUSDT',
              side: 'LONG',
              entry_price_vwap: 50000,
              quantity_open: 0.05,
              cost_basis: 2500,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ symbol: 'BTCUSDT', price: 51000 }],
        })
        .mockResolvedValueOnce({
          rows: [{ total_realized_pnl: 200 }],
        });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.runs).toHaveLength(1);
      expect(data.runs[0]).toMatchObject({
        run_id: 'test-run-1',
        equity: 10500,
        cash: 8000,
        margin_used: 2500,
        available_funds: 8000,
        realized_pnl: 200,
        unrealized_pnl: 50, // (51000 - 50000) * 0.05
        total_pnl: 250,
      });
    });

    it('should handle runs without account snapshots', async () => {
      const { GET } = await import('@/app/api/fake-trader/runs/route');
      
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              run_id: 'test-run-2',
              name: 'Test Run 2',
              symbols: [],
              timeframe: '15m',
              strategy_name: 'momentum_breakout_v2',
              strategy_version: '1.0',
              params: {},
              seed: 12345,
              status: 'active',
              starting_capital: 10000,
              current_capital: 10000,
              max_concurrent_positions: 3,
              started_at: '2025-01-01T00:00:00Z',
              last_update: '2025-01-01T01:00:00Z',
              stopped_at: null,
              error: null,
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // No snapshot
        .mockResolvedValueOnce({ rows: [] }) // No open positions
        .mockResolvedValueOnce({ rows: [{ total_realized_pnl: 0 }] });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.runs[0].equity).toBe(10000);
      expect(data.runs[0].cash).toBe(10000);
    });
  });

  describe('GET /api/fake-trader/runs/[runId]', () => {
    it('should return run details with canonical model metrics', async () => {
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
        .mockResolvedValueOnce({
          rows: [
            {
              position_id: 'pos-1',
              symbol: 'BTCUSDT',
              side: 'LONG',
              entry_price_vwap: 50000,
              quantity_open: 0.05,
              cost_basis: 2500,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ symbol: 'BTCUSDT', price: 51000 }],
        })
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
      expect(data.run).toMatchObject({
        run_id: 'test-run-1',
        equity: 10500,
        cash: 8000,
        margin_used: 2500,
        realized_pnl: 200,
        unrealized_pnl: 50,
        total_pnl: 250,
        total_fees: 50,
      });
    });

    it('should return 404 for non-existent run', async () => {
      const { GET } = await import('@/app/api/fake-trader/runs/[runId]/route');
      
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs/non-existent');
      const response = await GET(req, { params: { runId: 'non-existent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Fake trading run not found');
    });
  });

  describe('GET /api/fake-trader/runs/[runId]/positions', () => {
    it('should return open positions with unrealized PnL', async () => {
      const { GET } = await import('@/app/api/fake-trader/runs/[runId]/positions/route');
      
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              position_id: 'pos-1',
              run_id: 'test-run-1',
              symbol: 'BTCUSDT',
              side: 'LONG',
              status: 'OPEN',
              open_ts: '2025-01-01T00:00:00Z',
              close_ts: null,
              entry_price_vwap: 50000,
              exit_price_vwap: null,
              quantity_open: 0.05,
              quantity_close: 0,
              cost_basis: 2500,
              fees_total: 10,
              realized_pnl: 0,
              leverage_effective: 20,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ symbol: 'BTCUSDT', price: 51000 }],
        });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs/test-run-1/positions');
      const response = await GET(req, { params: { runId: 'test-run-1' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.positions).toHaveLength(1);
      expect(data.positions[0]).toMatchObject({
        position_id: 'pos-1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        status: 'OPEN',
        size: 0.05,
        entry_price: 50000,
        current_price: 51000,
        unrealized_pnl: 50, // (51000 - 50000) * 0.05
        cost_basis: 2500,
        leverage: 20,
      });
    });

    it('should calculate SHORT position unrealized PnL correctly', async () => {
      const { GET } = await import('@/app/api/fake-trader/runs/[runId]/positions/route');
      
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              position_id: 'pos-2',
              run_id: 'test-run-1',
              symbol: 'ETHUSDT',
              side: 'SHORT',
              status: 'OPEN',
              open_ts: '2025-01-01T00:00:00Z',
              close_ts: null,
              entry_price_vwap: 3000,
              exit_price_vwap: null,
              quantity_open: 1,
              quantity_close: 0,
              cost_basis: 3000,
              fees_total: 12,
              realized_pnl: 0,
              leverage_effective: 10,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ symbol: 'ETHUSDT', price: 2900 }],
        });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs/test-run-1/positions');
      const response = await GET(req, { params: { runId: 'test-run-1' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.positions[0].unrealized_pnl).toBe(100); // (3000 - 2900) * 1
    });
  });

  describe('GET /api/fake-trader/runs/[runId]/trades', () => {
    it('should return closed positions as trades', async () => {
      const { GET } = await import('@/app/api/fake-trader/runs/[runId]/trades/route');
      
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            trade_id: 'pos-1',
            run_id: 'test-run-1',
            symbol: 'BTCUSDT',
            side: 'LONG',
            entry_ts: '2025-01-01T00:00:00Z',
            exit_ts: '2025-01-01T02:00:00Z',
            qty: 0.05,
            entry_px: 50000,
            exit_px: 51000,
            realized_pnl: 48,
            fees: 2,
            leverage: 20,
            status: 'closed',
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
      });

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs/test-run-1/trades');
      const response = await GET(req, { params: { runId: 'test-run-1' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.trades).toHaveLength(1);
      expect(data.trades[0]).toMatchObject({
        trade_id: 'pos-1',
        symbol: 'BTCUSDT',
        side: 'LONG',
        entry_px: 50000,
        exit_px: 51000,
        realized_pnl: 48,
        fees: 2,
        status: 'closed',
        unrealized_pnl: 0,
      });
    });
  });

  describe('DELETE /api/fake-trader/runs', () => {
    it('should delete a single run and all related canonical data', async () => {
      const { DELETE } = await import('@/app/api/fake-trader/runs/route');
      
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // events
        .mockResolvedValueOnce({ rowCount: 0 }) // price_snapshots
        .mockResolvedValueOnce({ rowCount: 0 }) // fills
        .mockResolvedValueOnce({ rowCount: 0 }) // orders
        .mockResolvedValueOnce({ rowCount: 0 }) // account_snapshots
        .mockResolvedValueOnce({ rowCount: 0 }) // positions_v2
        .mockResolvedValueOnce({ rowCount: 0 }) // legacy trades
        .mockResolvedValueOnce({ rowCount: 0 }) // legacy results
        .mockResolvedValueOnce({ rowCount: 0 }) // legacy equity
        .mockResolvedValueOnce({ rowCount: 0 }) // legacy positions
        .mockResolvedValueOnce({
          rows: [{ name: 'Test Run' }],
        }) // delete run
        .mockResolvedValueOnce(undefined); // COMMIT

      const req = new NextRequest('http://localhost:3000/api/fake-trader/runs?run_id=test-run-1', {
        method: 'DELETE',
      });
      const response = await DELETE(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});

