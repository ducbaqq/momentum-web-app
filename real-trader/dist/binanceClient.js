import Binance from 'binance-api-node';
export class BinanceClient {
    client;
    config;
    constructor(config) {
        this.config = config;
        // Initialize Binance client
        this.client = Binance({
            apiKey: config.apiKey,
            apiSecret: config.apiSecret,
            httpFutures: config.testnet
                ? 'https://testnet.binancefuture.com'
                : 'https://fapi.binance.com',
            wsFutures: config.testnet
                ? 'wss://stream.binancefuture.com'
                : 'wss://fstream.binance.com',
        });
    }
    async testConnection() {
        try {
            await this.client.futuresTime();
            console.log(`✓ Binance ${this.config.testnet ? 'Testnet' : 'Mainnet'} connected successfully`);
            return true;
        }
        catch (error) {
            console.error('✗ Binance connection failed:', error);
            return false;
        }
    }
    async getAccountInfo() {
        try {
            return await this.client.futuresAccountInfo();
        }
        catch (error) {
            console.error('Failed to get account info:', error);
            throw error;
        }
    }
    async getPositions() {
        try {
            const accountInfo = await this.getAccountInfo();
            return accountInfo.positions.filter(p => parseFloat(p.positionAmt) !== 0);
        }
        catch (error) {
            console.error('Failed to get positions:', error);
            throw error;
        }
    }
    async getPosition(symbol) {
        try {
            const positions = await this.getPositions();
            return positions.find(p => p.symbol === symbol) || null;
        }
        catch (error) {
            console.error(`Failed to get position for ${symbol}:`, error);
            throw error;
        }
    }
    async getCurrentPrice(symbol) {
        try {
            const ticker = await this.client.futuresPrices({ symbol });
            return parseFloat(ticker[symbol]);
        }
        catch (error) {
            console.error(`Failed to get price for ${symbol}:`, error);
            throw error;
        }
    }
    async getCurrentPrices(symbols) {
        try {
            const tickers = await this.client.futuresPrices();
            const result = {};
            for (const symbol of symbols) {
                if (tickers[symbol]) {
                    result[symbol] = parseFloat(tickers[symbol]);
                }
            }
            return result;
        }
        catch (error) {
            console.error('Failed to get prices:', error);
            throw error;
        }
    }
    async placeFuturesMarketOrder(symbol, side, quantity, options) {
        try {
            // Set leverage if specified
            if (options?.leverage) {
                await this.client.futuresLeverage({
                    symbol,
                    leverage: options.leverage,
                });
            }
            // Set margin type if specified
            if (options?.marginType) {
                await this.client.futuresMarginType({
                    symbol,
                    marginType: options.marginType.toUpperCase(),
                });
            }
            // Place the order
            const order = await this.client.futuresOrder({
                symbol,
                side,
                type: 'MARKET',
                quantity: quantity.toString(),
                positionSide: options?.positionSide || 'BOTH',
            });
            return order;
        }
        catch (error) {
            console.error(`Failed to place ${side} order for ${symbol}:`, error);
            throw error;
        }
    }
    async placeFuturesLimitOrder(symbol, side, quantity, price, options) {
        try {
            // Set leverage if specified
            if (options?.leverage) {
                await this.client.futuresLeverage({
                    symbol,
                    leverage: options.leverage,
                });
            }
            // Set margin type if specified
            if (options?.marginType) {
                await this.client.futuresMarginType({
                    symbol,
                    marginType: options.marginType.toUpperCase(),
                });
            }
            // Place the order
            const order = await this.client.futuresOrder({
                symbol,
                side,
                type: 'LIMIT',
                quantity: quantity.toString(),
                price: price.toString(),
                timeInForce: options?.timeInForce || 'GTC',
                positionSide: options?.positionSide || 'BOTH',
            });
            return order;
        }
        catch (error) {
            console.error(`Failed to place ${side} limit order for ${symbol}:`, error);
            throw error;
        }
    }
    async placeStopLossOrder(symbol, side, quantity, stopPrice, options) {
        try {
            const order = await this.client.futuresOrder({
                symbol,
                side,
                type: 'STOP_MARKET',
                quantity: quantity.toString(),
                stopPrice: stopPrice.toString(),
                positionSide: options?.positionSide || 'BOTH',
            });
            return order;
        }
        catch (error) {
            console.error(`Failed to place stop loss order for ${symbol}:`, error);
            throw error;
        }
    }
    async placeTakeProfitOrder(symbol, side, quantity, stopPrice, options) {
        try {
            const order = await this.client.futuresOrder({
                symbol,
                side,
                type: 'TAKE_PROFIT_MARKET',
                quantity: quantity.toString(),
                stopPrice: stopPrice.toString(),
                positionSide: options?.positionSide || 'BOTH',
            });
            return order;
        }
        catch (error) {
            console.error(`Failed to place take profit order for ${symbol}:`, error);
            throw error;
        }
    }
    async cancelOrder(symbol, orderId) {
        try {
            return await this.client.futuresCancelOrder({
                symbol,
                orderId,
            });
        }
        catch (error) {
            console.error(`Failed to cancel order ${orderId} for ${symbol}:`, error);
            throw error;
        }
    }
    async getOrderStatus(symbol, orderId) {
        try {
            return await this.client.futuresGetOrder({
                symbol,
                orderId,
            });
        }
        catch (error) {
            console.error(`Failed to get order status ${orderId} for ${symbol}:`, error);
            throw error;
        }
    }
    async getSymbolInfo(symbol) {
        try {
            const exchangeInfo = await this.client.futuresExchangeInfo();
            return exchangeInfo.symbols.find((s) => s.symbol === symbol);
        }
        catch (error) {
            console.error(`Failed to get symbol info for ${symbol}:`, error);
            throw error;
        }
    }
    async getMinOrderSize(symbol) {
        try {
            const symbolInfo = await this.getSymbolInfo(symbol);
            const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE');
            return {
                minQty: parseFloat(lotSizeFilter.minQty),
                stepSize: parseFloat(lotSizeFilter.stepSize),
            };
        }
        catch (error) {
            console.error(`Failed to get min order size for ${symbol}:`, error);
            throw error;
        }
    }
    formatQuantity(symbol, quantity, stepSize) {
        // Round quantity to match step size requirements
        const precision = stepSize.toString().split('.')[1]?.length || 0;
        return Math.floor(quantity / stepSize) * stepSize;
    }
    async getAvailableBalance() {
        try {
            const accountInfo = await this.getAccountInfo();
            return parseFloat(accountInfo.availableBalance);
        }
        catch (error) {
            console.error('Failed to get available balance:', error);
            throw error;
        }
    }
    async getTotalWalletBalance() {
        try {
            const accountInfo = await this.getAccountInfo();
            return parseFloat(accountInfo.totalWalletBalance);
        }
        catch (error) {
            console.error('Failed to get total wallet balance:', error);
            throw error;
        }
    }
}
