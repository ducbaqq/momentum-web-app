--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: calculate_spread_bps(double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_spread_bps(bid_price double precision, ask_price double precision) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
      BEGIN
          IF bid_price <= 0 OR ask_price <= 0 OR ask_price <= bid_price THEN
              RETURN NULL;
          END IF;
          RETURN ((ask_price - bid_price) / ((bid_price + ask_price) / 2)) * 10000;
      END;
      $$;


--
-- Name: calculate_spread_bps(numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_spread_bps(bid_price numeric, ask_price numeric) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
      BEGIN
          IF bid_price <= 0 OR ask_price <= 0 OR ask_price <= bid_price THEN
              RETURN NULL;
          END IF;
          RETURN ((ask_price - bid_price) / ((bid_price + ask_price) / 2)) * 10000;
      END;
      $$;


--
-- Name: update_spread_bps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_spread_bps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          NEW.spread_bps := calculate_spread_bps(NEW.bid_px, NEW.ask_px);
          RETURN NEW;
      END;
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bt_equity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bt_equity (
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    ts timestamp with time zone NOT NULL,
    equity numeric
);


--
-- Name: bt_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bt_execution_logs (
    run_id text NOT NULL,
    symbol text NOT NULL,
    bar_index integer NOT NULL,
    ts timestamp with time zone NOT NULL,
    candle_data text NOT NULL,
    strategy_signals text NOT NULL,
    filtered_signals text NOT NULL,
    pending_signals text NOT NULL,
    executed_signals text NOT NULL,
    positions_before text NOT NULL,
    positions_after text NOT NULL,
    account_balance numeric(15,6) NOT NULL,
    total_equity numeric(15,6) NOT NULL,
    unrealized_pnl numeric(15,6) NOT NULL,
    execution_price numeric(15,6),
    slippage_amount numeric(15,6),
    commission_paid numeric(15,6),
    funding_paid numeric(15,6),
    strategy_state text NOT NULL,
    rejection_reasons text,
    execution_notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bt_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bt_results (
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    trades integer,
    wins integer,
    losses integer,
    pnl numeric,
    fees numeric,
    win_rate numeric,
    sharpe numeric,
    sortino numeric,
    max_dd numeric,
    profit_factor numeric,
    exposure numeric,
    turnover numeric
);


--
-- Name: bt_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bt_runs (
    run_id uuid NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now(),
    start_ts timestamp with time zone,
    end_ts timestamp with time zone,
    symbols text[],
    timeframe text,
    strategy_name text,
    strategy_version text,
    params jsonb,
    status text,
    seed integer,
    notes text,
    error text
);


--
-- Name: bt_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bt_trades (
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    entry_ts timestamp with time zone NOT NULL,
    exit_ts timestamp with time zone,
    side text,
    qty numeric,
    entry_px numeric,
    exit_px numeric,
    pnl numeric,
    fees numeric,
    reason text
);


--
-- Name: exchange_specs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_specs (
    symbol text NOT NULL,
    tick_size numeric(20,12) NOT NULL,
    lot_size numeric(20,12) NOT NULL,
    min_order_size numeric(20,12) NOT NULL,
    max_order_size numeric(20,8) NOT NULL,
    max_leverage integer NOT NULL,
    maker_fee_bps numeric(6,2) NOT NULL,
    taker_fee_bps numeric(6,2) NOT NULL,
    risk_tiers jsonb NOT NULL,
    funding_interval integer DEFAULT 8,
    max_funding_rate numeric(6,4) DEFAULT 0.0075,
    price_deviation_limit numeric(4,3) DEFAULT 0.1,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE exchange_specs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.exchange_specs IS 'Collect from /fapi/v1/exchangeInfo daily or when specs change';


--
-- Name: features_1m; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.features_1m (
    ts timestamp with time zone NOT NULL,
    symbol text NOT NULL,
    roc_1m double precision,
    roc_5m double precision,
    roc_15m double precision,
    roc_30m double precision,
    roc_1h double precision,
    roc_4h double precision,
    vol_avg_20 double precision,
    vol_mult double precision,
    rsi_14 double precision,
    ema_12 double precision,
    ema_26 double precision,
    ema_20 double precision,
    ema_50 double precision,
    macd double precision,
    macd_signal double precision,
    bb_basis double precision,
    bb_upper double precision,
    bb_lower double precision,
    book_imb double precision,
    spread_bps double precision
);


--
-- Name: ft_equity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ft_equity (
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    ts timestamp with time zone NOT NULL,
    cash_balance numeric(20,8) DEFAULT 0 NOT NULL,
    position_value numeric(20,8) DEFAULT 0 NOT NULL,
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    total_equity numeric(20,8) DEFAULT 0 NOT NULL,
    open_positions integer DEFAULT 0 NOT NULL,
    total_exposure numeric(20,8) DEFAULT 0 NOT NULL
);


--
-- Name: ft_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ft_positions (
    position_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    side text NOT NULL,
    size numeric(20,8) NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    current_price numeric(20,8),
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    cost_basis numeric(20,8) NOT NULL,
    market_value numeric(20,8),
    stop_loss numeric(20,8),
    take_profit numeric(20,8),
    leverage numeric(5,2) DEFAULT 1,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    last_update timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    CONSTRAINT ft_positions_side_check CHECK ((side = ANY (ARRAY['LONG'::text, 'SHORT'::text]))),
    CONSTRAINT ft_positions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closing'::text, 'closed'::text])))
);


--
-- Name: ft_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ft_results (
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    trades integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    open_positions integer DEFAULT 0 NOT NULL,
    realized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    total_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    fees numeric(20,8) DEFAULT 0 NOT NULL,
    win_rate numeric(5,2) DEFAULT 0 NOT NULL,
    sharpe numeric(10,4) DEFAULT 0 NOT NULL,
    sortino numeric(10,4) DEFAULT 0 NOT NULL,
    max_dd numeric(5,4) DEFAULT 0 NOT NULL,
    profit_factor numeric(10,4) DEFAULT 0 NOT NULL,
    exposure numeric(5,4) DEFAULT 0 NOT NULL,
    turnover numeric(20,8) DEFAULT 0 NOT NULL,
    first_trade_at timestamp with time zone,
    last_trade_at timestamp with time zone,
    last_update timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ft_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ft_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    symbols text[] NOT NULL,
    timeframe text DEFAULT '15m'::text NOT NULL,
    strategy_name text NOT NULL,
    strategy_version text DEFAULT '1.0'::text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    seed integer,
    status text DEFAULT 'active'::text NOT NULL,
    starting_capital numeric(20,8) DEFAULT 10000 NOT NULL,
    current_capital numeric(20,8) DEFAULT 10000 NOT NULL,
    max_concurrent_positions integer DEFAULT 3,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_update timestamp with time zone DEFAULT now(),
    stopped_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_processed_candle timestamp without time zone,
    CONSTRAINT ft_runs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'stopped'::text, 'error'::text, 'winding_down'::text])))
);


--
-- Name: ft_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ft_signals (
    signal_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    signal_type text NOT NULL,
    side text,
    size numeric(20,8),
    price numeric(20,8),
    candle_data jsonb,
    strategy_state jsonb,
    rejection_reason text,
    executed boolean DEFAULT false NOT NULL,
    execution_price numeric(20,8),
    execution_notes text,
    signal_ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ft_signals_side_check CHECK ((side = ANY (ARRAY['LONG'::text, 'SHORT'::text]))),
    CONSTRAINT ft_signals_signal_type_check CHECK ((signal_type = ANY (ARRAY['entry'::text, 'exit'::text, 'adjustment'::text])))
);


--
-- Name: ft_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ft_trades (
    trade_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    side text NOT NULL,
    entry_ts timestamp with time zone NOT NULL,
    exit_ts timestamp with time zone,
    qty numeric(20,8) NOT NULL,
    entry_px numeric(20,8) NOT NULL,
    exit_px numeric(20,8),
    realized_pnl numeric(20,8) DEFAULT 0,
    unrealized_pnl numeric(20,8) DEFAULT 0,
    fees numeric(20,8) DEFAULT 0 NOT NULL,
    reason text,
    leverage numeric(5,2) DEFAULT 1,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ft_trades_side_check CHECK ((side = ANY (ARRAY['LONG'::text, 'SHORT'::text]))),
    CONSTRAINT ft_trades_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'error'::text])))
);


--
-- Name: funding_8h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funding_8h (
    symbol text NOT NULL,
    funding_time timestamp with time zone NOT NULL,
    funding_rate numeric(10,8) NOT NULL,
    mark_price numeric(15,6),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE funding_8h; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.funding_8h IS 'Collect from /fapi/v1/fundingRate every 8 hours at 00:00, 08:00, 16:00 UTC';


--
-- Name: l1_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.l1_snapshots (
    ts timestamp with time zone NOT NULL,
    symbol text NOT NULL,
    bid_px double precision,
    bid_qty double precision,
    ask_px double precision,
    ask_qty double precision,
    spread double precision,
    mid double precision,
    spread_bps numeric(8,4)
);


--
-- Name: latest_funding_rates; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.latest_funding_rates AS
 SELECT DISTINCT ON (symbol) symbol,
    funding_time,
    funding_rate,
    mark_price
   FROM public.funding_8h
  ORDER BY symbol, funding_time DESC;


--
-- Name: mark_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mark_prices (
    symbol text NOT NULL,
    ts timestamp with time zone NOT NULL,
    mark_price numeric(15,6) NOT NULL,
    index_price numeric(15,6),
    premium numeric(15,6),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE mark_prices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mark_prices IS 'Collect from /fapi/v1/premiumIndex every minute';


--
-- Name: latest_mark_prices; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.latest_mark_prices AS
 SELECT DISTINCT ON (symbol) symbol,
    ts,
    mark_price,
    index_price,
    premium
   FROM public.mark_prices
  ORDER BY symbol, ts DESC;


--
-- Name: ohlcv_1m; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ohlcv_1m (
    ts timestamp with time zone NOT NULL,
    symbol text NOT NULL,
    open double precision NOT NULL,
    high double precision NOT NULL,
    low double precision NOT NULL,
    close double precision NOT NULL,
    volume double precision NOT NULL,
    trades_count integer,
    vwap_minute double precision
);


--
-- Name: open_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.open_interest (
    symbol text NOT NULL,
    ts timestamp with time zone NOT NULL,
    open_interest numeric(20,6) NOT NULL,
    open_interest_value numeric(20,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE open_interest; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.open_interest IS 'Collect from /fapi/v1/openInterest every hour';


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    order_id text NOT NULL,
    ts timestamp with time zone NOT NULL,
    symbol text NOT NULL,
    side text NOT NULL,
    ord_type text NOT NULL,
    qty double precision NOT NULL,
    px double precision,
    status text NOT NULL,
    reason text,
    meta jsonb
);


--
-- Name: positions_snap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions_snap (
    ts timestamp with time zone NOT NULL,
    symbol text NOT NULL,
    qty double precision NOT NULL,
    entry_px double precision,
    upnl double precision,
    rpnl double precision,
    fees double precision,
    leverage double precision,
    liq_px double precision,
    margin_ratio double precision
);


--
-- Name: rt_daily_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rt_daily_summary (
    run_id uuid NOT NULL,
    trading_date date NOT NULL,
    trades_count integer DEFAULT 0 NOT NULL,
    realized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    fees numeric(20,8) DEFAULT 0 NOT NULL,
    daily_return_pct numeric(10,6) DEFAULT 0 NOT NULL,
    max_drawdown_pct numeric(5,4) DEFAULT 0 NOT NULL,
    capital_start numeric(20,8) DEFAULT 0 NOT NULL,
    capital_end numeric(20,8) DEFAULT 0 NOT NULL,
    max_concurrent_positions integer DEFAULT 0 NOT NULL,
    total_exposure numeric(20,8) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rt_equity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rt_equity (
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    ts timestamp with time zone NOT NULL,
    cash_balance numeric(20,8) DEFAULT 0 NOT NULL,
    position_value numeric(20,8) DEFAULT 0 NOT NULL,
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    total_equity numeric(20,8) DEFAULT 0 NOT NULL,
    open_positions integer DEFAULT 0 NOT NULL,
    total_exposure numeric(20,8) DEFAULT 0 NOT NULL
);


--
-- Name: rt_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rt_positions (
    position_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    side text NOT NULL,
    size numeric(20,8) NOT NULL,
    entry_price numeric(20,8) NOT NULL,
    current_price numeric(20,8),
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    cost_basis numeric(20,8) NOT NULL,
    market_value numeric(20,8),
    stop_loss numeric(20,8),
    take_profit numeric(20,8),
    leverage numeric(5,2) DEFAULT 1,
    binance_position_side text,
    binance_margin_type text,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    last_update timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    CONSTRAINT rt_positions_binance_margin_type_check CHECK ((binance_margin_type = ANY (ARRAY['isolated'::text, 'cross'::text]))),
    CONSTRAINT rt_positions_binance_position_side_check CHECK ((binance_position_side = ANY (ARRAY['LONG'::text, 'SHORT'::text]))),
    CONSTRAINT rt_positions_side_check CHECK ((side = ANY (ARRAY['LONG'::text, 'SHORT'::text]))),
    CONSTRAINT rt_positions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closing'::text, 'closed'::text])))
);


--
-- Name: rt_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rt_results (
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    trades integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    open_positions integer DEFAULT 0 NOT NULL,
    realized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    unrealized_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    total_pnl numeric(20,8) DEFAULT 0 NOT NULL,
    fees numeric(20,8) DEFAULT 0 NOT NULL,
    win_rate numeric(5,2) DEFAULT 0 NOT NULL,
    sharpe numeric(10,4) DEFAULT 0 NOT NULL,
    sortino numeric(10,4) DEFAULT 0 NOT NULL,
    max_dd numeric(5,4) DEFAULT 0 NOT NULL,
    profit_factor numeric(10,4) DEFAULT 0 NOT NULL,
    exposure numeric(5,4) DEFAULT 0 NOT NULL,
    turnover numeric(20,8) DEFAULT 0 NOT NULL,
    first_trade_at timestamp with time zone,
    last_trade_at timestamp with time zone,
    last_update timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rt_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rt_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    symbols text[] NOT NULL,
    timeframe text DEFAULT '15m'::text NOT NULL,
    strategy_name text NOT NULL,
    strategy_version text DEFAULT '1.0'::text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    seed integer,
    status text DEFAULT 'active'::text NOT NULL,
    starting_capital numeric(20,8) DEFAULT 10000 NOT NULL,
    current_capital numeric(20,8) DEFAULT 10000 NOT NULL,
    max_concurrent_positions integer DEFAULT 3,
    max_position_size_usd numeric(20,8) DEFAULT 1000,
    daily_loss_limit_pct numeric(5,2) DEFAULT 5.0,
    max_drawdown_pct numeric(5,2) DEFAULT 10.0,
    testnet boolean DEFAULT true NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_update timestamp with time zone DEFAULT now(),
    last_processed_candle timestamp with time zone,
    stopped_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rt_runs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'stopped'::text, 'error'::text, 'winding_down'::text])))
);


--
-- Name: rt_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rt_signals (
    signal_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    signal_type text NOT NULL,
    side text,
    size numeric(20,8),
    price numeric(20,8),
    candle_data jsonb,
    strategy_state jsonb,
    rejection_reason text,
    executed boolean DEFAULT false NOT NULL,
    execution_price numeric(20,8),
    execution_notes text,
    binance_order_id bigint,
    binance_response jsonb,
    signal_ts timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rt_signals_side_check CHECK ((side = ANY (ARRAY['LONG'::text, 'SHORT'::text]))),
    CONSTRAINT rt_signals_signal_type_check CHECK ((signal_type = ANY (ARRAY['entry'::text, 'exit'::text, 'adjustment'::text])))
);


--
-- Name: rt_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rt_trades (
    trade_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    symbol text NOT NULL,
    side text NOT NULL,
    entry_ts timestamp with time zone NOT NULL,
    exit_ts timestamp with time zone,
    qty numeric(20,8) NOT NULL,
    entry_px numeric(20,8) NOT NULL,
    exit_px numeric(20,8),
    realized_pnl numeric(20,8) DEFAULT 0,
    unrealized_pnl numeric(20,8) DEFAULT 0,
    fees numeric(20,8) DEFAULT 0 NOT NULL,
    binance_order_id bigint,
    binance_client_order_id text,
    reason text,
    leverage numeric(5,2) DEFAULT 1,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rt_trades_side_check CHECK ((side = ANY (ARRAY['LONG'::text, 'SHORT'::text]))),
    CONSTRAINT rt_trades_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'error'::text])))
);


--
-- Name: signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signals (
    ts timestamp with time zone NOT NULL,
    symbol text NOT NULL,
    close double precision,
    roc1m double precision,
    roc5m double precision,
    vol double precision,
    vol_avg double precision,
    vol_mult double precision,
    book_imb double precision,
    thresholds jsonb,
    rule_version text
);


--
-- Name: bt_equity bt_equity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt_equity
    ADD CONSTRAINT bt_equity_pkey PRIMARY KEY (run_id, symbol, ts);


--
-- Name: bt_execution_logs bt_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt_execution_logs
    ADD CONSTRAINT bt_execution_logs_pkey PRIMARY KEY (run_id, symbol, bar_index);


--
-- Name: bt_results bt_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt_results
    ADD CONSTRAINT bt_results_pkey PRIMARY KEY (run_id, symbol);


--
-- Name: bt_runs bt_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt_runs
    ADD CONSTRAINT bt_runs_pkey PRIMARY KEY (run_id);


--
-- Name: bt_trades bt_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bt_trades
    ADD CONSTRAINT bt_trades_pkey PRIMARY KEY (run_id, symbol, entry_ts);


--
-- Name: exchange_specs exchange_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_specs
    ADD CONSTRAINT exchange_specs_pkey PRIMARY KEY (symbol);


--
-- Name: features_1m features_1m_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.features_1m
    ADD CONSTRAINT features_1m_pkey PRIMARY KEY (symbol, ts);


--
-- Name: ft_equity ft_equity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_equity
    ADD CONSTRAINT ft_equity_pkey PRIMARY KEY (run_id, symbol, ts);


--
-- Name: ft_positions ft_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_positions
    ADD CONSTRAINT ft_positions_pkey PRIMARY KEY (position_id);


--
-- Name: ft_results ft_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_results
    ADD CONSTRAINT ft_results_pkey PRIMARY KEY (run_id, symbol);


--
-- Name: ft_runs ft_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_runs
    ADD CONSTRAINT ft_runs_pkey PRIMARY KEY (run_id);


--
-- Name: ft_signals ft_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_signals
    ADD CONSTRAINT ft_signals_pkey PRIMARY KEY (signal_id);


--
-- Name: ft_trades ft_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_trades
    ADD CONSTRAINT ft_trades_pkey PRIMARY KEY (trade_id);


--
-- Name: funding_8h funding_8h_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funding_8h
    ADD CONSTRAINT funding_8h_pkey PRIMARY KEY (symbol, funding_time);


--
-- Name: l1_snapshots l1_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.l1_snapshots
    ADD CONSTRAINT l1_snapshots_pkey PRIMARY KEY (symbol, ts);


--
-- Name: mark_prices mark_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mark_prices
    ADD CONSTRAINT mark_prices_pkey PRIMARY KEY (symbol, ts);


--
-- Name: ohlcv_1m ohlcv_1m_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ohlcv_1m
    ADD CONSTRAINT ohlcv_1m_pkey PRIMARY KEY (symbol, ts);


--
-- Name: open_interest open_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_interest
    ADD CONSTRAINT open_interest_pkey PRIMARY KEY (symbol, ts);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (order_id);


--
-- Name: positions_snap positions_snap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions_snap
    ADD CONSTRAINT positions_snap_pkey PRIMARY KEY (symbol, ts);


--
-- Name: rt_daily_summary rt_daily_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_daily_summary
    ADD CONSTRAINT rt_daily_summary_pkey PRIMARY KEY (run_id, trading_date);


--
-- Name: rt_equity rt_equity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_equity
    ADD CONSTRAINT rt_equity_pkey PRIMARY KEY (run_id, symbol, ts);


--
-- Name: rt_positions rt_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_positions
    ADD CONSTRAINT rt_positions_pkey PRIMARY KEY (position_id);


--
-- Name: rt_results rt_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_results
    ADD CONSTRAINT rt_results_pkey PRIMARY KEY (run_id, symbol);


--
-- Name: rt_runs rt_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_runs
    ADD CONSTRAINT rt_runs_pkey PRIMARY KEY (run_id);


--
-- Name: rt_signals rt_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_signals
    ADD CONSTRAINT rt_signals_pkey PRIMARY KEY (signal_id);


--
-- Name: rt_trades rt_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_trades
    ADD CONSTRAINT rt_trades_pkey PRIMARY KEY (trade_id);


--
-- Name: signals signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signals
    ADD CONSTRAINT signals_pkey PRIMARY KEY (symbol, ts);


--
-- Name: bt_runs_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bt_runs_status_created_idx ON public.bt_runs USING btree (status, created_at);


--
-- Name: features_1m_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX features_1m_ts_idx ON public.features_1m USING btree (ts);


--
-- Name: idx_bt_equity_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_equity_ts ON public.bt_equity USING btree (run_id, symbol, ts);


--
-- Name: idx_bt_execution_logs_run_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_execution_logs_run_symbol ON public.bt_execution_logs USING btree (run_id, symbol, bar_index);


--
-- Name: idx_bt_execution_logs_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_execution_logs_ts ON public.bt_execution_logs USING btree (run_id, ts);


--
-- Name: idx_bt_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_runs_created_at ON public.bt_runs USING btree (created_at);


--
-- Name: idx_bt_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_runs_status ON public.bt_runs USING btree (status);


--
-- Name: idx_bt_trades_entry_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_trades_entry_ts ON public.bt_trades USING btree (entry_ts DESC);


--
-- Name: idx_bt_trades_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_trades_run_id ON public.bt_trades USING btree (run_id);


--
-- Name: idx_bt_trades_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bt_trades_symbol ON public.bt_trades USING btree (symbol);


--
-- Name: idx_exchange_specs_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_specs_updated ON public.exchange_specs USING btree (updated_at DESC);


--
-- Name: idx_ft_equity_run_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_equity_run_ts ON public.ft_equity USING btree (run_id, ts DESC);


--
-- Name: idx_ft_positions_run_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_positions_run_symbol ON public.ft_positions USING btree (run_id, symbol);


--
-- Name: idx_ft_positions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_positions_status ON public.ft_positions USING btree (status);


--
-- Name: idx_ft_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_runs_created_at ON public.ft_runs USING btree (created_at DESC);


--
-- Name: idx_ft_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_runs_status ON public.ft_runs USING btree (status);


--
-- Name: idx_ft_signals_run_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_signals_run_ts ON public.ft_signals USING btree (run_id, signal_ts DESC);


--
-- Name: idx_ft_trades_entry_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_trades_entry_ts ON public.ft_trades USING btree (entry_ts DESC);


--
-- Name: idx_ft_trades_run_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_trades_run_symbol ON public.ft_trades USING btree (run_id, symbol);


--
-- Name: idx_ft_trades_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ft_trades_status ON public.ft_trades USING btree (status);


--
-- Name: idx_funding_8h_symbol_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_funding_8h_symbol_time ON public.funding_8h USING btree (symbol, funding_time DESC);


--
-- Name: idx_mark_prices_symbol_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mark_prices_symbol_ts ON public.mark_prices USING btree (symbol, ts DESC);


--
-- Name: idx_open_interest_symbol_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_open_interest_symbol_ts ON public.open_interest USING btree (symbol, ts DESC);


--
-- Name: idx_rt_daily_summary_run_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_daily_summary_run_date ON public.rt_daily_summary USING btree (run_id, trading_date DESC);


--
-- Name: idx_rt_equity_run_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_equity_run_ts ON public.rt_equity USING btree (run_id, ts DESC);


--
-- Name: idx_rt_positions_run_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_positions_run_symbol ON public.rt_positions USING btree (run_id, symbol);


--
-- Name: idx_rt_positions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_positions_status ON public.rt_positions USING btree (status);


--
-- Name: idx_rt_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_runs_created_at ON public.rt_runs USING btree (created_at DESC);


--
-- Name: idx_rt_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_runs_status ON public.rt_runs USING btree (status);


--
-- Name: idx_rt_runs_testnet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_runs_testnet ON public.rt_runs USING btree (testnet);


--
-- Name: idx_rt_signals_run_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_signals_run_ts ON public.rt_signals USING btree (run_id, signal_ts DESC);


--
-- Name: idx_rt_trades_binance_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_trades_binance_order_id ON public.rt_trades USING btree (binance_order_id);


--
-- Name: idx_rt_trades_entry_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_trades_entry_ts ON public.rt_trades USING btree (entry_ts DESC);


--
-- Name: idx_rt_trades_run_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_trades_run_symbol ON public.rt_trades USING btree (run_id, symbol);


--
-- Name: idx_rt_trades_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rt_trades_status ON public.rt_trades USING btree (status);


--
-- Name: ohlcv_1m_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ohlcv_1m_ts_idx ON public.ohlcv_1m USING btree (ts);


--
-- Name: signals_symbol_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signals_symbol_ts_idx ON public.signals USING btree (symbol, ts DESC);


--
-- Name: l1_snapshots trigger_update_spread_bps; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_spread_bps BEFORE INSERT OR UPDATE ON public.l1_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_spread_bps();


--
-- Name: ft_equity ft_equity_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_equity
    ADD CONSTRAINT ft_equity_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ft_runs(run_id) ON DELETE CASCADE;


--
-- Name: ft_positions ft_positions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_positions
    ADD CONSTRAINT ft_positions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ft_runs(run_id) ON DELETE CASCADE;


--
-- Name: ft_results ft_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_results
    ADD CONSTRAINT ft_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ft_runs(run_id) ON DELETE CASCADE;


--
-- Name: ft_signals ft_signals_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_signals
    ADD CONSTRAINT ft_signals_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ft_runs(run_id) ON DELETE CASCADE;


--
-- Name: ft_trades ft_trades_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ft_trades
    ADD CONSTRAINT ft_trades_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ft_runs(run_id) ON DELETE CASCADE;


--
-- Name: rt_daily_summary rt_daily_summary_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_daily_summary
    ADD CONSTRAINT rt_daily_summary_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.rt_runs(run_id) ON DELETE CASCADE;


--
-- Name: rt_equity rt_equity_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_equity
    ADD CONSTRAINT rt_equity_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.rt_runs(run_id) ON DELETE CASCADE;


--
-- Name: rt_positions rt_positions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_positions
    ADD CONSTRAINT rt_positions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.rt_runs(run_id) ON DELETE CASCADE;


--
-- Name: rt_results rt_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_results
    ADD CONSTRAINT rt_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.rt_runs(run_id) ON DELETE CASCADE;


--
-- Name: rt_signals rt_signals_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_signals
    ADD CONSTRAINT rt_signals_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.rt_runs(run_id) ON DELETE CASCADE;


--
-- Name: rt_trades rt_trades_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rt_trades
    ADD CONSTRAINT rt_trades_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.rt_runs(run_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

