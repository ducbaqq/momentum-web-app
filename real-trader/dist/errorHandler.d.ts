import { BinanceError, ErrorHandler, ErrorHandlingResult } from './types.js';
export declare class BinanceErrorHandler implements ErrorHandler {
    private maxRetries;
    private baseRetryDelay;
    private circuitBreakerEnabled;
    private failureCount;
    private lastFailureTime;
    private circuitBreakerThreshold;
    private circuitBreakerTimeout;
    constructor(options?: {
        maxRetries?: number;
        baseRetryDelay?: number;
        enableCircuitBreaker?: boolean;
    });
    handleBinanceError(error: BinanceError): ErrorHandlingResult;
    shouldRetry(error: BinanceError): boolean;
    getRetryDelay(error: BinanceError, attempt: number): number;
    private isCircuitBreakerOpen;
    private isNetworkError;
    private isRateLimitError;
    private isRequestValidationError;
    private isOrderError;
    private isAuthenticationError;
    private getLogLevel;
    private getErrorMessage;
    getCircuitBreakerStatus(): {
        isOpen: boolean;
        failureCount: number;
        timeUntilReset: number;
    };
    resetCircuitBreaker(): void;
}
export declare function parseBinanceError(error: any): BinanceError | null;
export declare function isRetryableError(error: any): boolean;
