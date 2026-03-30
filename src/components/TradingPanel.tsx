"use client";

import { useState, useEffect, useCallback } from "react";
import { useKotakTrading } from "@/hooks/useKotakTrading";
import { kotakTradingService } from "@/lib/services/KotakTradingService";
import { getDynamicPollingService } from "@/lib/services/DynamicPollingService";
import { tradingRulesService } from "@/lib/services/TradingRulesService";
import { ScripResult } from "@/lib/services/ScripSearchService";
import { isMarketOpen } from "@/lib/utils/marketHours";
import { RiskManager } from "@/lib/risk/RiskManager";
import { getTradesService } from "@/lib/services/TradesService";
import {
  getMarketDataStreamService,
  PriceUpdate,
} from "@/lib/services/MarketDataStreamService";
import Watchlist from "./trading/Watchlist";
import OrderForm, { OrderPayload } from "./trading/OrderForm";
import PositionsTable from "./trading/PositionsTable";
import OrdersTable from "./trading/OrdersTable";
import { OptionsChain } from "./OptionsChain";
import { PriceAlerts } from "./PriceAlerts";
import ResyncButton from "./ResyncButton";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Wallet,
  LayoutList,
  TrendingUp,
  AlertTriangle,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import AIAnalysisPanel from "./trading/Aianalysispanel";
import DeactivateTradingButton from "./deactiveButton";

interface TradingPanelProps {
  sessionInfo: any;
  onSessionExpired?: () => void;
}

type BottomTab = "positions" | "orders" | "chain" | "alerts" | "ai";

export default function TradingPanel({
  sessionInfo,
  onSessionExpired,
}: TradingPanelProps) {
  const trading = useKotakTrading();
  const [selectedScrip, setSelectedScrip] = useState<ScripResult | null>(null);
  const [defaultSide, setDefaultSide] = useState<"BUY" | "SELL">("BUY");
  const [bottomTab, setBottomTab] = useState<BottomTab>("positions");
  const [showResync, setShowResync] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [selectedScripLTP, setSelectedScripLTP] = useState<number | undefined>(
    undefined,
  );

  const [tradingEnabled, setTradingEnabled] = useState<boolean | null>(null);
  const [tradingDisabledReason, setTradingDisabledReason] = useState<
    string | null
  >(null);
  const [showRules, setShowRules] = useState(false);
  const [niftyLTP, setNiftyLTP] = useState<number | null>(null);

  // ── Connect with session on mount ────────────────────────────────────────
  useEffect(() => {
    if (sessionInfo && !trading.isConnected) {
      trading.connectWithSession(sessionInfo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInfo]);

  // ── Check trading status — shared fn so DeactivateTradingButton can trigger a refresh ──
  const refreshTradingStatus = useCallback(async () => {
    try {
      // Primary: TradingRulesService (your existing rules engine)
      const { isEnabled, reason } = await tradingRulesService.isTradingEnabled();

      // Secondary: also check the manual trading_enabled kill-switch in Supabase
      const tradesService = getTradesService();
      const manualStatus = await tradesService.getTradingEnabled();

      // Both must be enabled — manual switch takes priority
      const finalEnabled = isEnabled && (manualStatus?.isEnabled ?? true);
      const finalReason = !manualStatus?.isEnabled
        ? (manualStatus?.disabledReason ?? "Manually disabled")
        : reason;

      setTradingEnabled(finalEnabled);
      setTradingDisabledReason(finalReason);
    } catch (error) {
      console.error("[TradingPanel] Failed to check trading status:", error);
      setTradingEnabled(false);
      setTradingDisabledReason("Unable to check status");
    }
  }, []);

  // Poll every 10s
  useEffect(() => {
    refreshTradingStatus();
    const interval = setInterval(refreshTradingStatus, 10000);
    return () => clearInterval(interval);
  }, [refreshTradingStatus]);

  // ── NIFTY 50 live price via WebSocket (REST fallback) ────────────────────
  useEffect(() => {
    if (!selectedScrip) return;

    const seg   = (selectedScrip.p_exch_seg || selectedScrip.segment || 'nse_fo').toLowerCase();
    const token = selectedScrip.p_tok ?? selectedScrip.p_symbol;
    if (!token) return;

    let cancelled = false;

    const fetchLTP = async () => {
      if (cancelled) return;
      try {
        const result = await kotakTradingService.getLTP(token, seg);
        if (result?.ltp > 0 && !cancelled) {
          setSelectedScripLTP(result.ltp);
        }
      } catch (err) {
        console.warn('[TradingPanel] selectedScrip LTP fetch failed:', err);
      }
    };

    fetchLTP();
    const id = setInterval(fetchLTP, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
      setSelectedScripLTP(undefined);
    };
  }, [selectedScrip?.p_tok, selectedScrip?.p_exch_seg, trading.isConnected]);

  useEffect(() => {
    if (!trading.isConnected) return;

    const NIFTY_TOKEN = "26000";
    const NIFTY_SEG = "nse_cm";
    const scripKey = `${NIFTY_SEG}|${NIFTY_TOKEN}`;

    let wsRef: any = null;
    let heartbeatRef: ReturnType<typeof setInterval> | null = null;
    let pollRef: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const session = (() => {
      try {
        return JSON.parse(localStorage.getItem("kotak_session") || "{}");
      } catch {
        return {};
      }
    })();

    const startRestPoll = () => {
      if (cancelled || pollRef) return;
      const doFetch = async () => {
        if (cancelled) return;
        try {
          const result = await kotakTradingService.getLTP(NIFTY_TOKEN, NIFTY_SEG);
          if (result?.ltp > 0 && !cancelled) {
            setNiftyLTP(result.ltp);
          }
        } catch (err) {
          console.warn("[TradingPanel] ⚠️ NIFTY REST fetch failed:", err);
        }
      };
      doFetch();
      pollRef = setInterval(doFetch, 5000);
    };

    if (
      session?.tradingToken &&
      session?.tradingSid &&
      typeof window !== "undefined"
    ) {
      try {
        const WsClass =
          typeof (window as any).HSWebSocket === "function"
            ? (window as any).HSWebSocket
            : WebSocket;

        const ws = new WsClass("wss://mlhsm.kotaksecurities.com");
        wsRef = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ Authorization: session.tradingToken, Sid: session.tradingSid, type: "cn" }));
          heartbeatRef = setInterval(() => {
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ti", scrips: "" }));
          }, 30_000);
          setTimeout(() => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "mws", scrips: scripKey, channelnum: 1 }));
            }
          }, 800);
        };

        ws.onmessage = (msgOrEvent: any) => {
          try {
            const raw = typeof msgOrEvent === "string" ? msgOrEvent : msgOrEvent?.data;
            if (!raw) return;
            const data = typeof raw === "string" ? JSON.parse(raw) : raw;
            const quotes = Array.isArray(data) ? data : data?.data ? data.data : [data];
            for (const q of quotes) {
              if (!q) continue;
              const tickToken = String(q.tk ?? q.token ?? "");
              if (tickToken && tickToken !== NIFTY_TOKEN) continue;
              const rawLtp = q.ltp ?? q.ltP ?? q.lp ?? q.last_price;
              if (rawLtp === undefined) continue;
              const price = parseFloat(String(rawLtp));
              if (price > 1000 && !cancelled) setNiftyLTP(price);
            }
          } catch { /* ignore */ }
        };

        ws.onerror = () => startRestPoll();
        ws.onclose = () => {
          if (heartbeatRef) { clearInterval(heartbeatRef); heartbeatRef = null; }
          if (!cancelled) startRestPoll();
        };
      } catch {
        startRestPoll();
      }
    } else {
      startRestPoll();
    }

    return () => {
      cancelled = true;
      if (heartbeatRef) clearInterval(heartbeatRef);
      if (pollRef) clearInterval(pollRef);
      if (wsRef) { try { wsRef.close(); } catch { /* ignore */ } }
    };
  }, [trading.isConnected]);

  // ── Auto-refresh with dynamic polling ────────────────────────────────────
  useEffect(() => {
    if (!trading.isConnected || !isMarketOpen()) return;

    const pollingService = getDynamicPollingService();
    const hasPositions = trading.positions.length > 0;

    const pollCallback = async () => {
      if (isMarketOpen()) {
        await trading.refreshData();
        setLastRefreshed(new Date());
      } else {
        pollingService.stopPolling();
      }
    };

    if (!pollingService.isActive()) {
      pollingService.startPolling(pollCallback, hasPositions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trading.isConnected]);

  // ── Update polling interval when position count changes ──────────────────
  useEffect(() => {
    const pollingService = getDynamicPollingService();
    const hasPositions = trading.positions.length > 0;
    pollingService.updatePositionStatus(hasPositions);
  }, [trading.positions.length]);

  // ── Cache positions tokens to localStorage ───────────────────────────────
  useEffect(() => {
    if (!trading.isConnected || trading.positions.length === 0) return;
    const positionsForCache = trading.positions.map((p) => ({
      trdSym: (p as any).symbol,
      tok: (p as any).tok,
      exSeg: (p as any).exchange,
    }));
    localStorage.setItem("kotak_positions", JSON.stringify(positionsForCache));
  }, [trading.positions, trading.isConnected]);

  // ── Bubble session expiry to parent ──────────────────────────────────────
  useEffect(() => {
    if (trading.sessionExpired && onSessionExpired) onSessionExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trading.sessionExpired]);

  // ── Live LTP for selected scrip ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedScrip) return;

    const seg = (selectedScrip.p_exch_seg || selectedScrip.segment || "nse_fo").toLowerCase();
    const token = selectedScrip.p_tok ?? selectedScrip.p_symbol;
    if (!token) return;

    let cancelled = false;

    const fetchLTP = async () => {
      if (cancelled) return;
      try {
        const result = await kotakTradingService.getLTP(token, seg);
        if (result?.ltp > 0 && !cancelled) setSelectedScripLTP(result.ltp);
      } catch (err) {
        console.warn("[TradingPanel] selectedScrip LTP fetch failed:", err);
      }
    };

    fetchLTP();
    const id = setInterval(fetchLTP, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
      setSelectedScripLTP(undefined);
    };
  }, [selectedScrip?.p_symbol, selectedScrip?.p_exch_seg, trading.isConnected]);

  // ── Live WebSocket for open positions ────────────────────────────────────
  const positionSymbolsKey = trading.positions
    .filter((p) => (p.quantity || 0) !== 0)
    .map((p) => `${(p as any).exchange || "nse_fo"}|${(p as any).tok || p.symbol}`)
    .sort()
    .join(",");

  useEffect(() => {
    if (!trading.isConnected) return;

    const openPositions = trading.positions.filter((p) => (p.quantity || 0) !== 0);
    if (openPositions.length === 0) return;

    const session = JSON.parse(localStorage.getItem("kotak_session") || "{}");
    if (!session?.tradingToken || !session?.tradingSid) return;

    let wsRef: any = null;
    let heartbeatRef: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const tokenToTrdSym: Record<string, string> = {};
    const positionScrips: string[] = [];
    for (const pos of openPositions) {
      const trdSym = (pos as any).symbol || "";
      const tok = (pos as any).tok || "";
      const exchange = ((pos as any).exchange || "nse_fo").toLowerCase();
      if (tok) {
        positionScrips.push(`${exchange}|${tok}`);
        tokenToTrdSym[tok] = trdSym;
        tokenToTrdSym[trdSym] = trdSym;
      } else if (trdSym) {
        positionScrips.push(`${exchange}|${trdSym}`);
        tokenToTrdSym[trdSym] = trdSym;
      }
    }

    if (positionScrips.length === 0) return;

    try {
      const WsClass =
        typeof (window as any).HSWebSocket === "function"
          ? (window as any).HSWebSocket
          : WebSocket;

      const ws = new WsClass("wss://mlhsm.kotaksecurities.com");
      wsRef = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ Authorization: session.tradingToken, Sid: session.tradingSid, type: "cn" }));
        heartbeatRef = setInterval(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "ti", scrips: "" }));
        }, 30000);
        setTimeout(() => {
          if (ws.readyState === 1) {
            positionScrips.forEach((scrip, idx) => {
              ws.send(JSON.stringify({ type: "mws", scrips: scrip, channelnum: idx + 2 }));
            });
          }
        }, 800);
      };

      ws.onmessage = (msgOrEvent: any) => {
        try {
          const raw = typeof msgOrEvent === "string" ? msgOrEvent : msgOrEvent?.data;
          if (!raw) return;
          const data = typeof raw === "string" ? JSON.parse(raw) : raw;
          const quotes = Array.isArray(data) ? data : data?.data ? data.data : [data];
          for (const q of quotes) {
            if (!q) continue;
            const rawLtp = q.ltp ?? q.ltP ?? q.lp ?? q.last_price;
            if (rawLtp === undefined) continue;
            const price = parseFloat(String(rawLtp));
            if (price <= 0 || cancelled) continue;
            const wsToken = q.tk || q.token || "";
            const wsTrdSym = q.tsym || q.sym || q.display_symbol || "";
            const matchedSym = tokenToTrdSym[wsToken] || tokenToTrdSym[wsTrdSym] || "";
            if (matchedSym) trading.updatePositionLTP(matchedSym, price);
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => console.warn("[TradingPanel] Position WebSocket error");
      ws.onclose = () => {
        if (heartbeatRef) { clearInterval(heartbeatRef); heartbeatRef = null; }
      };
    } catch (error) {
      console.error("[TradingPanel] Error starting position WebSocket:", error);
    }

    return () => {
      cancelled = true;
      if (heartbeatRef) clearInterval(heartbeatRef);
      if (wsRef) { try { wsRef.close(); } catch { /* ignore */ } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionSymbolsKey, trading.isConnected]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleManualRefresh = async () => {
    await trading.refreshData();
    setLastRefreshed(new Date());
  };

  const handleWatchlistSelect = (scrip: ScripResult, side: "BUY" | "SELL") => {
    setSelectedScrip(scrip);
    setDefaultSide(side);
    setSelectedScripLTP(undefined);
  };

  const handleLTPUpdate = (trdSymbol: string, ltp: number) => {
    setSelectedScrip((current) => {
      if (current && trdSymbol === current.p_trd_symbol) setSelectedScripLTP(ltp);
      return current;
    });
  };

  const handlePlaceOrder = async (
    order: OrderPayload,
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // Guard: double-check kill-switch before every order
      const tradesService = getTradesService();
      const manualStatus = await tradesService.getTradingEnabled();
      if (!manualStatus?.isEnabled) {
        return {
          success: false,
          message: "⛔ Trading is deactivated. Re-enable in Supabase to resume.",
        };
      }

      const riskManager = new RiskManager();
      const orderRequest = {
        symbol: order.trdSymbol,
        exchange: order.exchSeg,
        side: order.side as any,
        quantity: order.quantity,
        orderType: order.orderType as any,
        productType: order.productType as any,
        price: order.price,
        triggerPrice: order.triggerPrice,
      };

      const validationResult = await riskManager.validateOrder(orderRequest, {
        livePositions: trading.positions,
        liveOrders: trading.orders,
      });
      if (!validationResult.isValid) {
        const errorMsg = validationResult.errors.join(" | ");
        return { success: false, message: `Trading rule violation: ${errorMsg}` };
      }

      const storedAuth = localStorage.getItem("kotak_session");
      if (!storedAuth) throw new Error("Session not found. Please login again.");

      const session = JSON.parse(storedAuth);
      const { tradingToken, tradingSid, baseUrl } = session;

      if (!tradingToken || !tradingSid || !baseUrl) {
        throw new Error("Invalid session - missing authentication credentials. Please login again.");
      }

      const consumerKey = process.env.NEXT_PUBLIC_KOTAK_CONSUMER_KEY!;

      const sendOrder = async (overrides: Partial<typeof order> = {}) => {
        const o = { ...order, ...overrides };
        const payload = {
          action: "placeOrder",
          tradingToken, tradingSid, baseUrl, consumerKey,
          am: "NO", dq: "0", es: o.exchSeg, mp: "0",
          pc: o.productType, pf: "N",
          pr: String(o.orderType === "MARKET" || o.orderType === "SL-M" ? 0 : o.price),
          pt: o.orderType,
          qty: String(o.quantity),
          rt: "DAY",
          tp: String(o.orderType === "SL" || o.orderType === "SL-M" ? o.triggerPrice : 0),
          tt: o.side === "BUY" ? "B" : "S",
          ts: o.trdSymbol,
        };

        const res = await fetch("/api/kotak/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { return { ok: false, data: null, raw: text }; }
        return { ok: res.ok, data, raw: text };
      };

      let { ok, data } = await sendOrder();

      if (!ok && data?.details?.stCode === 1041 && order.orderType === "MARKET") {
        const ltp = await kotakTradingService.getLTP(order.trdSymbol, order.exchSeg);
        const limitPrice = ltp.ltp > 0 ? ltp.ltp : 0;
        const retry = await sendOrder({ orderType: "LIMIT", price: limitPrice });
        ok = retry.ok;
        data = retry.data;
        if (ok && data?.data?.nOrdNo) {
          await trading.refreshData();
          setLastRefreshed(new Date());
          return {
            success: true,
            message: `✅ Order placed as LIMIT @ ₹${limitPrice} (market order was rejected — LTP unavailable). ID: ${data.data.nOrdNo}`,
          };
        }
      }

      if (ok && data?.data?.nOrdNo) {
        await trading.refreshData();
        setLastRefreshed(new Date());
        return { success: true, message: `✅ Order Placed! ID: ${data.data.nOrdNo}` };
      }

      const kotakMsg = data?.details?.errMsg || data?.details?.emsg || data?.error || "Order placement failed";
      return { success: false, message: `❌ ${kotakMsg}` };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Order failed" };
    }
  };

  const totalPnL = trading.positions.reduce((sum: number, p: any) => sum + (p.pnl ?? 0), 0);

  return (
    <div className="flex flex-col bg-gray-100 overflow-hidden" style={{ height: "100vh" }}>

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Status dot */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${trading.isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-sm font-bold text-gray-800 hidden sm:inline">
              {trading.isConnected ? "Kotak Neo" : "Disconnected"}
            </span>
          </div>

          {/* Balance chip */}
          {trading.isConnected && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg border border-gray-200 text-sm font-bold text-gray-800 flex-shrink-0">
              <Wallet size={12} className="text-gray-400" />
              ₹{trading.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          )}

          {/* P&L chip */}
          {trading.isConnected && trading.positions.length > 0 && (
            <div className={`px-2.5 py-1 rounded-lg border text-sm font-bold flex-shrink-0 ${
              totalPnL >= 0 ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
            }`}>
              {totalPnL >= 0 ? "+" : ""}₹{totalPnL.toFixed(2)}
            </div>
          )}

          {/* Trading status badge + Deactivate button */}
          {tradingEnabled !== null && (
            <div className="flex items-center gap-1.5">

              {/* ON / OFF badge */}
              <div
                className={`px-2.5 py-1 rounded-lg border text-sm font-bold flex items-center gap-1 flex-shrink-0 ${
                  tradingEnabled
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
                title={tradingDisabledReason || "Trading is enabled"}
              >
                {tradingEnabled ? (
                  <><CheckCircle size={14} /><span className="hidden sm:inline">Trading ON</span></>
                ) : (
                  <><AlertCircle size={14} /><span className="hidden sm:inline">Trading OFF</span></>
                )}
              </div>

              {/* ── Deactivate button — only shown when trading is ON ── */}
              {tradingEnabled && (
                <DeactivateTradingButton
                  onDeactivated={refreshTradingStatus}
                />
              )}

              {/* Rules info tooltip */}
              <div className="relative z-40">
                <button
                  onMouseEnter={() => setShowRules(true)}
                  onMouseLeave={() => setShowRules(false)}
                  onClick={() => setShowRules(!showRules)}
                  className={`p-1.5 rounded-lg border transition ${
                    tradingEnabled
                      ? "bg-green-50 border-green-200 hover:bg-green-100"
                      : "bg-red-50 border-red-200 hover:bg-red-100"
                  }`}
                  title="View trading rules"
                >
                  <Info size={14} className={tradingEnabled ? "text-green-600" : "text-red-600"} />
                </button>

                {showRules && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-gray-900 text-white text-xs rounded-lg p-4 shadow-2xl z-50 border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <p className="font-semibold">📋 Trading Rules</p>
                      <button onClick={() => setShowRules(false)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Only NIFTY Options (CE/PE)</span></div>
                      <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Max 1 lot per order</span></div>
                      <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>Max 3 trades per day</span></div>
                      <div className="flex items-start gap-2"><span className="text-green-400 mt-0.5">✓</span><span>No concurrent live trades</span></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <p className="text-gray-400 text-xs">Master switch (Rule -1) must be enabled to trade</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NIFTY live price chip */}
          {trading.isConnected && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-200 text-sm font-bold text-blue-700 flex-shrink-0">
              <TrendingUp size={14} className="text-blue-600" />
              <span className="hidden sm:inline">NIFTY:</span>
              {niftyLTP !== null ? (
                <span>₹{niftyLTP.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              ) : (
                <span className="text-gray-400">--</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {lastRefreshed && (
            <span className="text-xs text-gray-400 hidden lg:inline">{lastRefreshed.toLocaleTimeString()}</span>
          )}

          {trading.isConnected && (
            <button
              onClick={handleManualRefresh}
              disabled={trading.isLoading}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
              title="Refresh data"
            >
              <RefreshCw size={14} className={trading.isLoading ? "animate-spin" : ""} />
            </button>
          )}

          <button
            onClick={() => setShowResync((v) => !v)}
            className={`text-xs font-medium px-2 py-1 border rounded transition ${
              showResync ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-500 hover:text-blue-600"
            }`}
          >
            ⟳ Sync
          </button>

          <button
            onClick={() => trading.isConnected ? trading.disconnect() : trading.connect()}
            disabled={trading.isLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
              trading.isConnected
                ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
            }`}
          >
            {trading.isLoading ? <Loader2 size={12} className="animate-spin" /> : trading.isConnected ? <WifiOff size={12} /> : <Wifi size={12} />}
            {trading.isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </header>

      {/* Collapsible Resync Panel */}
      {showResync && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
          <ResyncButton />
        </div>
      )}

      {/* Session Expired Banner */}
      {trading.sessionExpired && (
        <div className="bg-orange-50 border-b border-orange-300 px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle size={14} className="text-orange-600 flex-shrink-0" />
          <p className="text-xs text-orange-800 font-semibold flex-1">Session expired — please login again to continue trading.</p>
          <button onClick={() => onSessionExpired?.()} className="text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded font-bold flex-shrink-0">
            Login Again
          </button>
        </div>
      )}

      {/* Error Banner */}
      {trading.error && !trading.sessionExpired && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle size={13} className="text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 flex-1 truncate">{trading.error}</p>
          <button onClick={handleManualRefresh} className="text-xs text-red-600 underline hover:text-red-800 flex-shrink-0">Retry</button>
        </div>
      )}

      {/* ── MAIN BODY ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* LEFT: Watchlist */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Watchlist</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <Watchlist onSelectScrip={handleWatchlistSelect} niftyLTP={niftyLTP} onLTPUpdate={handleLTPUpdate} />
          </div>
        </div>

        {/* MIDDLE: Order Form */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Place Order</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <OrderForm
              selectedScrip={selectedScrip}
              defaultSide={defaultSide}
              isConnected={trading.isConnected}
              isLoading={trading.isLoading}
              currentLTP={selectedScripLTP}
              isTradingEnabled={tradingEnabled ?? false}
              onPlaceOrder={handlePlaceOrder}
              onClear={() => {
                setSelectedScrip(null);
                setSelectedScripLTP(undefined);
              }}
            />
          </div>
        </div>

        {/* RIGHT: Positions / Orders / Chain */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
          <div className="flex border-b border-gray-200 flex-shrink-0 bg-gray-50">
            <button
              onClick={() => setBottomTab("positions")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "positions" ? "border-blue-500 text-blue-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <TrendingUp size={12} />
              Positions
              {trading.positions.length > 0 && (
                <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 rounded-full font-bold">{trading.positions.length}</span>
              )}
            </button>

            <button
              onClick={() => setBottomTab("orders")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "orders" ? "border-blue-500 text-blue-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <LayoutList size={12} />
              Orders
              {trading.orders.length > 0 && (
                <span className="ml-1 bg-gray-200 text-gray-600 text-xs px-1.5 rounded-full font-bold">{trading.orders.length}</span>
              )}
              {trading.orders.filter((o) => { const s = (o.status || "").toLowerCase(); return (s.includes("complete") || s === "traded") && o.side?.toUpperCase() === "BUY"; }).length > 0 && (
                <span className="ml-0.5 bg-green-100 text-green-700 text-xs px-1.5 rounded-full font-bold">
                  B✓{trading.orders.filter((o) => { const s = (o.status || "").toLowerCase(); return (s.includes("complete") || s === "traded") && o.side?.toUpperCase() === "BUY"; }).length}
                </span>
              )}
              {trading.orders.filter((o) => { const s = (o.status || "").toLowerCase(); return (s.includes("complete") || s === "traded") && o.side?.toUpperCase() === "SELL"; }).length > 0 && (
                <span className="ml-0.5 bg-red-100 text-red-600 text-xs px-1.5 rounded-full font-bold">
                  S✓{trading.orders.filter((o) => { const s = (o.status || "").toLowerCase(); return (s.includes("complete") || s === "traded") && o.side?.toUpperCase() === "SELL"; }).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setBottomTab("chain")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "chain" ? "border-blue-500 text-blue-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              📈 Options Chain
            </button>

            <button
              onClick={() => setBottomTab("alerts")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "alerts" ? "border-blue-500 text-blue-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              🔔 Alerts
            </button>

            <button
              onClick={() => setBottomTab("ai")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "ai" ? "border-blue-500 text-blue-600 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              🧠 AI Analysis
            </button>
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            {bottomTab === "positions" ? (
              <PositionsTable
                positions={trading.positions as any}
                isLoading={trading.isLoading}
                onExit={async (symbol) => { await trading.exitPosition(symbol); await trading.refreshData(); setLastRefreshed(new Date()); }}
                onRefresh={handleManualRefresh}
              />
            ) : bottomTab === "orders" ? (
              <OrdersTable
                orders={trading.orders as any}
                isLoading={trading.isLoading}
                onCancel={async (id) => { await trading.cancelOrder(id); await trading.refreshData(); setLastRefreshed(new Date()); }}
                onRefresh={handleManualRefresh}
              />
            ) : bottomTab === "chain" ? (
              <div className="p-4 overflow-auto h-full">
                <OptionsChain onSelectScrip={handleWatchlistSelect} niftyLTP={niftyLTP} />
              </div>
            ) : bottomTab === "alerts" ? (
              <PriceAlerts currentPrice={niftyLTP} />
            ) : bottomTab === "ai" ? (
              <div className="h-full overflow-hidden">
                <AIAnalysisPanel niftyLTP={niftyLTP} isConnected={trading.isConnected} />
              </div>
            ) : <div />}
          </div>
        </div>
      </div>
    </div>
  );
}