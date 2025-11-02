/**
 * Unit tests for fake trader page utility functions
 */

describe('Fake Trader Page Utilities', () => {
  describe('calculatePnL', () => {
    function calculatePnL(
      startingCapital: number,
      currentCapital: number,
      realizedPnl?: number,
      unrealizedPnl?: number
    ) {
      if (realizedPnl !== undefined && unrealizedPnl !== undefined) {
        const totalPnl = realizedPnl + unrealizedPnl;
        const pnlPercent = ((totalPnl / startingCapital) * 100);
        return { pnl: totalPnl, pnlPercent, realizedPnl, unrealizedPnl };
      }
      const pnl = currentCapital - startingCapital;
      const pnlPercent = ((pnl / startingCapital) * 100);
      return { pnl, pnlPercent, realizedPnl: pnl, unrealizedPnl: 0 };
    }

    it('should calculate PnL correctly with new fields', () => {
      const result = calculatePnL(10000, 10500, 200, 300);
      
      expect(result.pnl).toBe(500);
      expect(result.pnlPercent).toBe(5);
      expect(result.realizedPnl).toBe(200);
      expect(result.unrealizedPnl).toBe(300);
    });

    it('should fallback to old calculation when new fields missing', () => {
      const result = calculatePnL(10000, 10500);
      
      expect(result.pnl).toBe(500);
      expect(result.pnlPercent).toBe(5);
    });
  });

  describe('formatCapital', () => {
    function formatCapital(capital: number): string {
      return `$${capital.toLocaleString()}`;
    }

    it('should format capital with commas', () => {
      expect(formatCapital(10000)).toBe('$10,000');
      expect(formatCapital(1000000)).toBe('$1,000,000');
    });

    it('should handle decimal values', () => {
      expect(formatCapital(10000.5)).toBe('$10,000.5');
    });

    it('should handle negative values', () => {
      expect(formatCapital(-1000)).toBe('$-1,000');
    });
  });

  describe('formatTimestamp', () => {
    function formatTimestamp(timestamp: string): string {
      return new Date(timestamp).toLocaleString();
    }

    it('should format ISO timestamp correctly', () => {
      const result = formatTimestamp('2025-01-01T00:00:00Z');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });
});

