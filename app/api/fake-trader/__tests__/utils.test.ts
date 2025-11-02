/**
 * Unit tests for fake trader utility functions
 */

describe('Fake Trader Utilities', () => {
  describe('PnL Calculations', () => {
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

    it('should calculate PnL correctly with realized and unrealized', () => {
      const result = calculatePnL(10000, 10500, 200, 300);
      
      expect(result.pnl).toBe(500);
      expect(result.pnlPercent).toBe(5);
      expect(result.realizedPnl).toBe(200);
      expect(result.unrealizedPnl).toBe(300);
    });

    it('should calculate PnL correctly with fallback method', () => {
      const result = calculatePnL(10000, 10500);
      
      expect(result.pnl).toBe(500);
      expect(result.pnlPercent).toBe(5);
      expect(result.realizedPnl).toBe(500);
      expect(result.unrealizedPnl).toBe(0);
    });

    it('should handle negative PnL', () => {
      const result = calculatePnL(10000, 9500, -300, -200);
      
      expect(result.pnl).toBe(-500);
      expect(result.pnlPercent).toBe(-5);
      expect(result.realizedPnl).toBe(-300);
      expect(result.unrealizedPnl).toBe(-200);
    });

    it('should handle zero PnL', () => {
      const result = calculatePnL(10000, 10000, 0, 0);
      
      expect(result.pnl).toBe(0);
      expect(result.pnlPercent).toBe(0);
    });
  });

  describe('Unrealized PnL Calculations', () => {
    function calculateUnrealizedPnL(
      side: 'LONG' | 'SHORT',
      entryPrice: number,
      currentPrice: number,
      quantity: number
    ): number {
      if (side === 'LONG') {
        return (currentPrice - entryPrice) * quantity;
      } else {
        return (entryPrice - currentPrice) * quantity;
      }
    }

    it('should calculate LONG position unrealized PnL correctly', () => {
      const pnl = calculateUnrealizedPnL('LONG', 50000, 51000, 0.05);
      expect(pnl).toBe(50); // (51000 - 50000) * 0.05
    });

    it('should calculate SHORT position unrealized PnL correctly', () => {
      const pnl = calculateUnrealizedPnL('SHORT', 3000, 2900, 1);
      expect(pnl).toBe(100); // (3000 - 2900) * 1
    });

    it('should handle negative unrealized PnL for LONG', () => {
      const pnl = calculateUnrealizedPnL('LONG', 50000, 49000, 0.05);
      expect(pnl).toBe(-50); // (49000 - 50000) * 0.05
    });

    it('should handle negative unrealized PnL for SHORT', () => {
      const pnl = calculateUnrealizedPnL('SHORT', 3000, 3100, 1);
      expect(pnl).toBe(-100); // (3000 - 3100) * 1
    });

    it('should handle zero unrealized PnL', () => {
      const pnl = calculateUnrealizedPnL('LONG', 50000, 50000, 0.05);
      expect(pnl).toBe(0);
    });
  });

  describe('Account Metrics Calculations', () => {
    function calculateAvailableFunds(
      equity: number,
      marginUsed: number
    ): number {
      return equity - marginUsed;
    }

    it('should calculate available funds correctly', () => {
      const available = calculateAvailableFunds(10500, 2500);
      expect(available).toBe(8000);
    });

    it('should handle zero margin used', () => {
      const available = calculateAvailableFunds(10000, 0);
      expect(available).toBe(10000);
    });

    it('should handle negative available funds (margin call scenario)', () => {
      const available = calculateAvailableFunds(8000, 10000);
      expect(available).toBe(-2000);
    });
  });

  describe('Total PnL Calculations', () => {
    function calculateTotalPnL(
      realizedPnl: number,
      unrealizedPnl: number
    ): number {
      return realizedPnl + unrealizedPnl;
    }

    it('should calculate total PnL correctly', () => {
      const total = calculateTotalPnL(200, 300);
      expect(total).toBe(500);
    });

    it('should handle mixed positive and negative PnL', () => {
      const total = calculateTotalPnL(500, -200);
      expect(total).toBe(300);
    });

    it('should handle both negative PnL', () => {
      const total = calculateTotalPnL(-100, -200);
      expect(total).toBe(-300);
    });
  });
});

