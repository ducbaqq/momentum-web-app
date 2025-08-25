// Binance Enums from enums.md
export var SymbolStatus;
(function (SymbolStatus) {
    SymbolStatus["TRADING"] = "TRADING";
    SymbolStatus["END_OF_DAY"] = "END_OF_DAY";
    SymbolStatus["HALT"] = "HALT";
    SymbolStatus["BREAK"] = "BREAK";
})(SymbolStatus || (SymbolStatus = {}));
export var OrderStatus;
(function (OrderStatus) {
    OrderStatus["NEW"] = "NEW";
    OrderStatus["PENDING_NEW"] = "PENDING_NEW";
    OrderStatus["PARTIALLY_FILLED"] = "PARTIALLY_FILLED";
    OrderStatus["FILLED"] = "FILLED";
    OrderStatus["CANCELED"] = "CANCELED";
    OrderStatus["PENDING_CANCEL"] = "PENDING_CANCEL";
    OrderStatus["REJECTED"] = "REJECTED";
    OrderStatus["EXPIRED"] = "EXPIRED";
    OrderStatus["EXPIRED_IN_MATCH"] = "EXPIRED_IN_MATCH";
})(OrderStatus || (OrderStatus = {}));
export var OrderType;
(function (OrderType) {
    OrderType["LIMIT"] = "LIMIT";
    OrderType["MARKET"] = "MARKET";
    OrderType["STOP_LOSS"] = "STOP_LOSS";
    OrderType["STOP_LOSS_LIMIT"] = "STOP_LOSS_LIMIT";
    OrderType["TAKE_PROFIT"] = "TAKE_PROFIT";
    OrderType["TAKE_PROFIT_LIMIT"] = "TAKE_PROFIT_LIMIT";
    OrderType["LIMIT_MAKER"] = "LIMIT_MAKER";
})(OrderType || (OrderType = {}));
export var OrderSide;
(function (OrderSide) {
    OrderSide["BUY"] = "BUY";
    OrderSide["SELL"] = "SELL";
})(OrderSide || (OrderSide = {}));
export var TimeInForce;
(function (TimeInForce) {
    TimeInForce["GTC"] = "GTC";
    TimeInForce["IOC"] = "IOC";
    TimeInForce["FOK"] = "FOK"; // Fill or Kill
})(TimeInForce || (TimeInForce = {}));
export var OrderResponseType;
(function (OrderResponseType) {
    OrderResponseType["ACK"] = "ACK";
    OrderResponseType["RESULT"] = "RESULT";
    OrderResponseType["FULL"] = "FULL";
})(OrderResponseType || (OrderResponseType = {}));
export var RateLimitType;
(function (RateLimitType) {
    RateLimitType["REQUEST_WEIGHT"] = "REQUEST_WEIGHT";
    RateLimitType["ORDERS"] = "ORDERS";
    RateLimitType["RAW_REQUESTS"] = "RAW_REQUESTS";
})(RateLimitType || (RateLimitType = {}));
export var RateLimitInterval;
(function (RateLimitInterval) {
    RateLimitInterval["SECOND"] = "SECOND";
    RateLimitInterval["MINUTE"] = "MINUTE";
    RateLimitInterval["DAY"] = "DAY";
})(RateLimitInterval || (RateLimitInterval = {}));
export var STPMode;
(function (STPMode) {
    STPMode["NONE"] = "NONE";
    STPMode["EXPIRE_MAKER"] = "EXPIRE_MAKER";
    STPMode["EXPIRE_TAKER"] = "EXPIRE_TAKER";
    STPMode["EXPIRE_BOTH"] = "EXPIRE_BOTH";
    STPMode["DECREMENT"] = "DECREMENT";
})(STPMode || (STPMode = {}));
export var BinanceErrorCode;
(function (BinanceErrorCode) {
    // General Server or Network issues (10xx)
    BinanceErrorCode[BinanceErrorCode["UNKNOWN"] = -1000] = "UNKNOWN";
    BinanceErrorCode[BinanceErrorCode["DISCONNECTED"] = -1001] = "DISCONNECTED";
    BinanceErrorCode[BinanceErrorCode["UNAUTHORIZED"] = -1002] = "UNAUTHORIZED";
    BinanceErrorCode[BinanceErrorCode["TOO_MANY_REQUESTS"] = -1003] = "TOO_MANY_REQUESTS";
    BinanceErrorCode[BinanceErrorCode["UNEXPECTED_RESP"] = -1006] = "UNEXPECTED_RESP";
    BinanceErrorCode[BinanceErrorCode["TIMEOUT"] = -1007] = "TIMEOUT";
    BinanceErrorCode[BinanceErrorCode["SERVER_BUSY"] = -1008] = "SERVER_BUSY";
    BinanceErrorCode[BinanceErrorCode["INVALID_MESSAGE"] = -1013] = "INVALID_MESSAGE";
    BinanceErrorCode[BinanceErrorCode["UNKNOWN_ORDER_COMPOSITION"] = -1014] = "UNKNOWN_ORDER_COMPOSITION";
    BinanceErrorCode[BinanceErrorCode["TOO_MANY_ORDERS"] = -1015] = "TOO_MANY_ORDERS";
    BinanceErrorCode[BinanceErrorCode["SERVICE_SHUTTING_DOWN"] = -1016] = "SERVICE_SHUTTING_DOWN";
    BinanceErrorCode[BinanceErrorCode["UNSUPPORTED_OPERATION"] = -1020] = "UNSUPPORTED_OPERATION";
    BinanceErrorCode[BinanceErrorCode["INVALID_TIMESTAMP"] = -1021] = "INVALID_TIMESTAMP";
    BinanceErrorCode[BinanceErrorCode["INVALID_SIGNATURE"] = -1022] = "INVALID_SIGNATURE";
    // Request issues (11xx)
    BinanceErrorCode[BinanceErrorCode["ILLEGAL_CHARS"] = -1100] = "ILLEGAL_CHARS";
    BinanceErrorCode[BinanceErrorCode["TOO_MANY_PARAMETERS"] = -1101] = "TOO_MANY_PARAMETERS";
    BinanceErrorCode[BinanceErrorCode["MANDATORY_PARAM_EMPTY_OR_MALFORMED"] = -1102] = "MANDATORY_PARAM_EMPTY_OR_MALFORMED";
    BinanceErrorCode[BinanceErrorCode["UNKNOWN_PARAM"] = -1103] = "UNKNOWN_PARAM";
    BinanceErrorCode[BinanceErrorCode["UNREAD_PARAMETERS"] = -1104] = "UNREAD_PARAMETERS";
    BinanceErrorCode[BinanceErrorCode["PARAM_EMPTY"] = -1105] = "PARAM_EMPTY";
    BinanceErrorCode[BinanceErrorCode["PARAM_NOT_REQUIRED"] = -1106] = "PARAM_NOT_REQUIRED";
    BinanceErrorCode[BinanceErrorCode["BAD_PRECISION"] = -1111] = "BAD_PRECISION";
    BinanceErrorCode[BinanceErrorCode["NO_DEPTH"] = -1112] = "NO_DEPTH";
    BinanceErrorCode[BinanceErrorCode["TIF_NOT_REQUIRED"] = -1114] = "TIF_NOT_REQUIRED";
    BinanceErrorCode[BinanceErrorCode["INVALID_TIF"] = -1115] = "INVALID_TIF";
    BinanceErrorCode[BinanceErrorCode["INVALID_ORDER_TYPE"] = -1116] = "INVALID_ORDER_TYPE";
    BinanceErrorCode[BinanceErrorCode["INVALID_SIDE"] = -1117] = "INVALID_SIDE";
    BinanceErrorCode[BinanceErrorCode["EMPTY_NEW_CL_ORD_ID"] = -1118] = "EMPTY_NEW_CL_ORD_ID";
    BinanceErrorCode[BinanceErrorCode["EMPTY_ORG_CL_ORD_ID"] = -1119] = "EMPTY_ORG_CL_ORD_ID";
    BinanceErrorCode[BinanceErrorCode["BAD_INTERVAL"] = -1120] = "BAD_INTERVAL";
    BinanceErrorCode[BinanceErrorCode["BAD_SYMBOL"] = -1121] = "BAD_SYMBOL";
    // Order issues (2xxx)
    BinanceErrorCode[BinanceErrorCode["NEW_ORDER_REJECTED"] = -2010] = "NEW_ORDER_REJECTED";
    BinanceErrorCode[BinanceErrorCode["CANCEL_REJECTED"] = -2011] = "CANCEL_REJECTED";
    BinanceErrorCode[BinanceErrorCode["ORDER_DOES_NOT_EXIST"] = -2013] = "ORDER_DOES_NOT_EXIST";
    BinanceErrorCode[BinanceErrorCode["BAD_API_KEY_FMT"] = -2014] = "BAD_API_KEY_FMT";
    BinanceErrorCode[BinanceErrorCode["REJECTED_MBX_KEY"] = -2015] = "REJECTED_MBX_KEY";
})(BinanceErrorCode || (BinanceErrorCode = {}));
// Position side for futures
export var PositionSide;
(function (PositionSide) {
    PositionSide["LONG"] = "LONG";
    PositionSide["SHORT"] = "SHORT";
    PositionSide["BOTH"] = "BOTH";
})(PositionSide || (PositionSide = {}));
