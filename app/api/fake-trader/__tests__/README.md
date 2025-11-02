# Fake Trader Unit Tests

This directory contains unit tests for the fake trader functionality in the web app.

## Test Structure

- `routes.test.ts` - Unit tests for API route handlers
- `integration.test.ts` - Integration tests for API endpoints
- `utils.test.ts` - Unit tests for utility functions (PnL calculations, formatting)

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- routes.test.ts
```

## Test Coverage

### API Routes
- ✅ GET /api/fake-trader/runs - List all runs with canonical model metrics
- ✅ GET /api/fake-trader/runs/[runId] - Get run details
- ✅ GET /api/fake-trader/runs/[runId]/positions - Get open positions
- ✅ GET /api/fake-trader/runs/[runId]/trades - Get closed trades
- ✅ DELETE /api/fake-trader/runs - Delete runs and related data

### Utility Functions
- ✅ PnL calculations (realized, unrealized, total)
- ✅ Unrealized PnL calculations (LONG/SHORT positions)
- ✅ Account metrics calculations
- ✅ Capital formatting

## Notes

- Tests use mocked database connections
- Dynamic route imports (routes with `[runId]`) may require special handling in Jest
- Utility function tests are fully functional and cover core business logic

