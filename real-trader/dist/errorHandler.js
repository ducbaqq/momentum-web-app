import { BinanceErrorCode } from './types.js';
export class BinanceErrorHandler {
    maxRetries;
    baseRetryDelay;
    circuitBreakerEnabled;
    failureCount = 0;
    lastFailureTime = 0;
    circuitBreakerThreshold = 5;
    circuitBreakerTimeout = 60000; // 1 minute
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.baseRetryDelay = options.baseRetryDelay || 1000;
        this.circuitBreakerEnabled = options.enableCircuitBreaker || true;
    }
    handleBinanceError(error) {
        const errorCode = error.code;
        const shouldRetry = this.shouldRetry(error);
        const retryDelay = this.getRetryDelay(error, 0);
        // Update circuit breaker state
        if (shouldRetry) {
            this.failureCount++;
            this.lastFailureTime = Date.now();
        }
        else {
            this.failureCount = 0; // Reset on successful handling
        }
        return {
            shouldRetry,
            retryDelay,
            logLevel: this.getLogLevel(errorCode),
            message: this.getErrorMessage(error)
        };
    }
    shouldRetry(error) {
        // Check circuit breaker
        if (this.isCircuitBreakerOpen()) {
            return false;
        }
        const errorCode = error.code;
        // Network and server issues - usually retryable
        if (this.isNetworkError(errorCode)) {
            return true;
        }
        // Rate limiting - retryable with backoff
        if (this.isRateLimitError(errorCode)) {
            return true;
        }
        // Request validation issues - usually not retryable
        if (this.isRequestValidationError(errorCode)) {
            return false;
        }
        // Order-specific issues - mostly not retryable
        if (this.isOrderError(errorCode)) {
            return false;
        }
        // Authentication issues - not retryable
        if (this.isAuthenticationError(errorCode)) {
            return false;
        }
        // Unknown errors - don't retry by default
        return false;
    }
    getRetryDelay(error, attempt) {
        const errorCode = error.code;
        // Special handling for rate limit errors
        if (this.isRateLimitError(errorCode)) {
            // Extract retry delay from error message if available
            const retryAfterMatch = error.msg.match(/(\d+)\s*seconds?/i);
            if (retryAfterMatch) {
                return parseInt(retryAfterMatch[1]) * 1000;
            }
            // Default rate limit backoff
            return Math.min(30000, this.baseRetryDelay * Math.pow(2, attempt));
        }
        // Server busy - shorter delay
        if (errorCode === BinanceErrorCode.SERVER_BUSY) {
            return Math.min(10000, this.baseRetryDelay * Math.pow(1.5, attempt));
        }
        // Network issues - exponential backoff
        if (this.isNetworkError(errorCode)) {
            return Math.min(60000, this.baseRetryDelay * Math.pow(2, attempt));
        }
        // Default exponential backoff
        return Math.min(30000, this.baseRetryDelay * Math.pow(2, attempt));
    }
    isCircuitBreakerOpen() {
        if (!this.circuitBreakerEnabled) {
            return false;
        }
        const now = Date.now();
        const timeSinceLastFailure = now - this.lastFailureTime;
        // Reset circuit breaker after timeout
        if (timeSinceLastFailure > this.circuitBreakerTimeout) {
            this.failureCount = 0;
            return false;
        }
        return this.failureCount >= this.circuitBreakerThreshold;
    }
    isNetworkError(code) {
        return [
            BinanceErrorCode.UNKNOWN,
            BinanceErrorCode.DISCONNECTED,
            BinanceErrorCode.UNEXPECTED_RESP,
            BinanceErrorCode.TIMEOUT,
            BinanceErrorCode.SERVER_BUSY
        ].includes(code);
    }
    isRateLimitError(code) {
        return [
            BinanceErrorCode.TOO_MANY_REQUESTS,
            BinanceErrorCode.TOO_MANY_ORDERS
        ].includes(code);
    }
    isRequestValidationError(code) {
        return [
            BinanceErrorCode.ILLEGAL_CHARS,
            BinanceErrorCode.TOO_MANY_PARAMETERS,
            BinanceErrorCode.MANDATORY_PARAM_EMPTY_OR_MALFORMED,
            BinanceErrorCode.UNKNOWN_PARAM,
            BinanceErrorCode.UNREAD_PARAMETERS,
            BinanceErrorCode.PARAM_EMPTY,
            BinanceErrorCode.PARAM_NOT_REQUIRED,
            BinanceErrorCode.BAD_PRECISION,
            BinanceErrorCode.NO_DEPTH,
            BinanceErrorCode.TIF_NOT_REQUIRED,
            BinanceErrorCode.INVALID_TIF,
            BinanceErrorCode.INVALID_ORDER_TYPE,
            BinanceErrorCode.INVALID_SIDE,
            BinanceErrorCode.EMPTY_NEW_CL_ORD_ID,
            BinanceErrorCode.EMPTY_ORG_CL_ORD_ID,
            BinanceErrorCode.BAD_INTERVAL,
            BinanceErrorCode.BAD_SYMBOL
        ].includes(code);
    }
    isOrderError(code) {
        return [
            BinanceErrorCode.NEW_ORDER_REJECTED,
            BinanceErrorCode.CANCEL_REJECTED,
            BinanceErrorCode.ORDER_DOES_NOT_EXIST
        ].includes(code);
    }
    isAuthenticationError(code) {
        return [
            BinanceErrorCode.UNAUTHORIZED,
            BinanceErrorCode.INVALID_TIMESTAMP,
            BinanceErrorCode.INVALID_SIGNATURE,
            BinanceErrorCode.BAD_API_KEY_FMT,
            BinanceErrorCode.REJECTED_MBX_KEY
        ].includes(code);
    }
    getLogLevel(code) {
        // Network issues and rate limits - warning level
        if (this.isNetworkError(code) || this.isRateLimitError(code)) {
            return 'warn';
        }
        // Authentication and validation errors - error level
        if (this.isAuthenticationError(code) || this.isRequestValidationError(code)) {
            return 'error';
        }
        // Order errors - warning level (expected in trading)
        if (this.isOrderError(code)) {
            return 'warn';
        }
        return 'error';
    }
    getErrorMessage(error) {
        const baseMessage = `Binance API Error ${error.code}: ${error.msg}`;
        switch (error.code) {
            case BinanceErrorCode.TOO_MANY_REQUESTS:
                return `${baseMessage}. Consider using WebSocket streams to reduce API calls.`;
            case BinanceErrorCode.INVALID_TIMESTAMP:
                return `${baseMessage}. Check system clock synchronization.`;
            case BinanceErrorCode.INVALID_SIGNATURE:
                return `${baseMessage}. Verify API key and secret configuration.`;
            case BinanceErrorCode.SERVER_BUSY:
                return `${baseMessage}. Binance servers are overloaded, retrying with backoff.`;
            case BinanceErrorCode.NEW_ORDER_REJECTED:
                return `${baseMessage}. Check order parameters and account status.`;
            case BinanceErrorCode.TIMEOUT:
                return `${baseMessage}. Request timed out, execution status unknown.`;
            default:
                return baseMessage;
        }
    }
    // Circuit breaker status methods
    getCircuitBreakerStatus() {
        const now = Date.now();
        const timeSinceLastFailure = now - this.lastFailureTime;
        const timeUntilReset = Math.max(0, this.circuitBreakerTimeout - timeSinceLastFailure);
        return {
            isOpen: this.isCircuitBreakerOpen(),
            failureCount: this.failureCount,
            timeUntilReset
        };
    }
    resetCircuitBreaker() {
        this.failureCount = 0;
        this.lastFailureTime = 0;
    }
}
// Utility function to parse Binance errors from API responses
export function parseBinanceError(error) {
    // Handle axios error response
    if (error.response?.data) {
        const data = error.response.data;
        if (data.code && data.msg) {
            return {
                code: data.code,
                msg: data.msg
            };
        }
    }
    // Handle direct Binance error object
    if (error.code && error.msg) {
        return {
            code: error.code,
            msg: error.msg
        };
    }
    // Handle binance-api-node error format
    if (error.body && typeof error.body === 'string') {
        try {
            const parsed = JSON.parse(error.body);
            if (parsed.code && parsed.msg) {
                return {
                    code: parsed.code,
                    msg: parsed.msg
                };
            }
        }
        catch (e) {
            // Ignore JSON parse errors
        }
    }
    return null;
}
// Utility function to check if error is retryable
export function isRetryableError(error) {
    const binanceError = parseBinanceError(error);
    if (!binanceError) {
        return false;
    }
    const handler = new BinanceErrorHandler();
    return handler.shouldRetry(binanceError);
}
