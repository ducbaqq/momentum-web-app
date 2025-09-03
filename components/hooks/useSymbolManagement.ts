import { useState, useCallback } from 'react';

export function useSymbolManagement(initialSymbols: string[] = []) {
  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);

  const toggleSymbol = useCallback((symbol: string) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  }, []);

  const selectAllSymbols = useCallback(() => {
    setSelectedSymbols(symbols);
  }, [symbols]);

  const clearAllSymbols = useCallback(() => {
    setSelectedSymbols([]);
  }, []);

  const updateSymbols = useCallback((newSymbols: string[]) => {
    setSymbols(newSymbols);
    // Remove any selected symbols that are no longer available
    setSelectedSymbols(prev => prev.filter(symbol => newSymbols.includes(symbol)));
  }, []);

  return {
    symbols,
    selectedSymbols,
    toggleSymbol,
    selectAllSymbols,
    clearAllSymbols,
    updateSymbols,
    setSelectedSymbols
  };
}
