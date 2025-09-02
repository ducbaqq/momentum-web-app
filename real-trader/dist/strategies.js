// Import everything from shared library
import { getStrategy as getSharedStrategy } from 'trading-shared';
// Re-export the shared strategy factory for compatibility
export const getStrategy = getSharedStrategy;
