"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useKotakTrading } from "@/hooks/useKotakTrading";
import { getDynamicPollingService } from "@/lib/services/DynamicPollingService";
import { tradingRulesService } from "@/lib/services/TradingRulesService";
import { tradingConfigService } from "@/lib/services/TradingConfigService";
import { ScripResult } from "@/lib/services/ScripSearchService";
import { isMarketOpen } from "@/lib/utils/marketHours";
import { getTradesService } from "@/lib/services/TradesService";
import { supabase } from "@/lib/supabase/client";
import {
  getMarketDataStreamService,
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

interface PinnedScripData {
  scrip: ScripResult;
  side: "BUY" | "SELL";
}

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

  // ── Sticky/Pinned scrip state ────────────────────────────────────────────
  const [isPinned, setIsPinned] = useState<boolean>(false);

  // Cache userId to avoid async lookup on every order
  const userIdRef = useRef<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? "";
    });
  }, []);

  // ── Restore pinned scrip from localStorage on mount ──────────────────────
  useEffect(() => {
    try {
      const pinnedData = localStorage.getItem('trading_pinned_scrip');
      if (pinnedData) {
        const parsed: PinnedScripData = JSON.parse(pinnedData);
        setSelectedScrip(parsed.scrip);
        setDefaultSide(parsed.side);
        setIsPinned(true);
      }
    } catch (error) {
      console.error('[TradingPanel] Error restoring pinned scrip:', error);
    }
  }, []); // Run once on mount

  // ── Save pinned scrip to localStorage whenever it changes ────────────────
  useEffect(() => {
    if (isPinned && selectedScrip) {
      const pinnedData: PinnedScripData = {
        scrip: selectedScrip,
        side: defaultSide,
      };
      localStorage.setItem('trading_pinned_scrip', JSON.stringify(pinnedData));
    } else if (!isPinned) {
      // Clear from storage when unpinned
      localStorage.removeItem('trading_pinned_scrip');
    }
  }, [isPinned, selectedScrip, defaultSide]);

  // Handler to toggle pin state
  const handleTogglePin = () => {
    setIsPinned(prev => !prev);
  };

  // ── Connect with session on mount ────────────────────────────────────────
  useEffect(() => {
    if (sessionInfo && !trading.isConnected) {
      trading.connectWithSession(sessionInfo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInfo]);

  // ── Check trading status ──────────────────────────────────────────────────
  const refreshTradingStatus = useCallback(async () => {
    try {
      const { isEnabled, reason } = await tradingRulesService.isTradingEnabled();

      const tradesService = getTradesService();
      const manualStatus = await tradesService.getTradingEnabled();

      const finalEnabled = isEnabled && (manualStatus?.isEnabled ?? true);
      const finalReason = !manualStatus?.isEnabled
        ? (manualStatus?.disabledReason ?? "Manually disabled")
        : reason;

      setTradingEnabled(finalEnabled);
      setTradingDisabledReason(finalReason);
    } catch (error) {
      setTradingEnabled(false);
      setTradingDisabledReason("Unable to check status");
    }
  }, []);

  useEffect(() => {
    refreshTradingStatus();
    const interval = setInterval(refreshTradingStatus, 10000);
    return () => clearInterval(interval);
  }, [refreshTradingStatus]);

  // ── Single MarketDataStreamService for ALL live prices ───────────────────
  // Subscribes NIFTY + selected scrip + open positions in ONE WS connection.
  // The service handles reconnect with exponential backoff internally.
  const selectedScripKey =
    selectedScrip
      ? `${(selectedScrip.p_exch_seg || selectedScrip.segment || "nse_fo").toLowerCase()}|${selectedScrip.p_tok ?? selectedScrip.p_symbol ?? ""}`
      : "";

  const positionSymbolsKey = trading.positions
    .filter((p) => (p.quantity || 0) !== 0)
    .map((p) => `${((p as any).exchange || "nse_fo").toLowerCase()}|${(p as any).tok || (p as any).symbol || ""}`)
    .sort()
    .join(",");

  // Ref to track which scrip keys the stream service currently knows about
  const streamScripsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!trading.isConnected) return;

    let session: any = {};
    try { session = JSON.parse(localStorage.getItem("kotak_session") || "{}"); } catch { /* */ }
    if (!session?.tradingToken || !session?.tradingSid) return;

    const NIFTY_KEY = "nse_cm|26000";
    const streamService = getMarketDataStreamService();

    // Build the complete scrip list: NIFTY + selected scrip + open positions
    const allScrips = new Set<string>([NIFTY_KEY]);
    if (selectedScripKey && selectedScripKey.endsWith("|")) {
      // token missing — skip
    } else if (selectedScripKey) {
      allScrips.add(selectedScripKey);
    }
    positionSymbolsKey.split(",").filter(Boolean).forEach((k) => allScrips.add(k));

    // Build token→trdSymbol map for position LTP updates
    const tokenToTrdSym: Record<string, string> = {};
    trading.positions
      .filter((p) => (p.quantity || 0) !== 0)
      .forEach((p) => {
        const tok    = (p as any).tok      || "";
        const trdSym = (p as any).symbol   || "";
        if (tok)    { tokenToTrdSym[tok]    = trdSym; }
        if (trdSym) { tokenToTrdSym[trdSym] = trdSym; }
      });

    const handlePrice = (update: { symbol: string; ltp: number }) => {
      const { symbol, ltp } = update;
      if (ltp <= 0) return;

      // NIFTY price
      if (symbol === NIFTY_KEY || symbol === "26000") {
        if (ltp > 1000) setNiftyLTP(ltp);
        return;
      }

      // Selected scrip price: match by full key OR by token alone
      const isMatch = selectedScripKey &&
        (symbol === selectedScripKey || symbol === selectedScrip?.p_tok || symbol === (selectedScrip?.p_tok ?? ""));
      
      if (isMatch) {
        setSelectedScripLTP(ltp);
      }

      // Position LTP
      const [, tok] = symbol.split("|");
      const matchedSym = tokenToTrdSym[tok] || tokenToTrdSym[symbol];
      if (matchedSym) trading.updatePositionLTP(matchedSym, ltp);
    };

    const scripsArray = Array.from(allScrips);

    if (!streamService.isConnected()) {
      // Fresh start — subscribe everything
      streamScripsRef.current = new Set(scripsArray);
      streamService.subscribe(session, scripsArray, handlePrice).catch((err) => {
      });
    } else {
      // Already connected — add only NEW scrips
      const toAdd = scripsArray.filter((k) => !streamScripsRef.current.has(k));
      if (toAdd.length > 0) {
        toAdd.forEach((k) => streamScripsRef.current.add(k));
        streamService.addSubscriptions(toAdd);
      }
      // Update price callback so closures are fresh
      streamService.setPriceCallback(handlePrice);
    }

    return () => {
      // Don't disconnect here — the service stays alive across scrip changes.
      // We only kill it when the component fully unmounts (isConnected → false).
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trading.isConnected, selectedScripKey, positionSymbolsKey]);

  // Kill stream on full disconnect / unmount
  useEffect(() => {
    if (!trading.isConnected) {
      getMarketDataStreamService().disconnect();
      streamScripsRef.current = new Set();
    }
  }, [trading.isConnected]);

  // Clear selected-scrip LTP when scrip changes
  useEffect(() => {
    setSelectedScripLTP(undefined);
  }, [selectedScripKey]);

  // ── Auto-refresh with dynamic polling ────────────────────────────────────
  useEffect(() => {
    if (!trading.isConnected || !isMarketOpen()) return;

    const pollingService = getDynamicPollingService();
    const hasPositions   = trading.positions.length > 0;

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
    pollingService.updatePositionStatus(trading.positions.length > 0);
  }, [trading.positions.length]);

  // ── Cache positions tokens to localStorage ───────────────────────────────
  useEffect(() => {
    if (!trading.isConnected || trading.positions.length === 0) return;
    const positionsForCache = trading.positions.map((p) => ({
      trdSym:  (p as any).symbol,
      tok:     (p as any).tok,
      exSeg:   (p as any).exchange,
    }));
    localStorage.setItem("kotak_positions", JSON.stringify(positionsForCache));
  }, [trading.positions, trading.isConnected]);

  // ── Bubble session expiry to parent ──────────────────────────────────────
  useEffect(() => {
    if (trading.sessionExpired && onSessionExpired) onSessionExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trading.sessionExpired]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleManualRefresh = async () => {
    await trading.refreshData();
    setLastRefreshed(new Date());
  };

  const handleWatchlistSelect = (scrip: ScripResult, side: "BUY" | "SELL") => {
    setSelectedScrip(scrip);
    setDefaultSide(side);
  };

  const handleLTPUpdate = (trdSymbol: string, ltp: number) => {
    if (selectedScrip && trdSymbol === selectedScrip.p_trd_symbol) {
      setSelectedScripLTP(ltp);
    }
  };

  const handlePlaceOrder = async (
    order: OrderPayload,
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // ── VALIDATION: Check for concurrent trades ────────────────────────────
      // Get trading config to check if concurrent trades are prevented
      const config = await tradingConfigService.getConfig();
      
      if (config.prevent_concurrent_trades) {
        // Check if there are any open positions
        const openPositions = trading.positions.filter(p => (p.quantity || 0) !== 0);
        
        if (openPositions.length > 0) {
          // Check if this order is closing an existing position
          const matchingPosition = openPositions.find(pos => 
            pos.symbol === order.trdSymbol || 
            pos.symbol === order.symbol
          );
          
          if (matchingPosition) {
            // This order is closing an existing position - allow it
            const isClosingOrder = (
              (matchingPosition.quantity > 0 && order.side === 'SELL') || // Long position, selling
              (matchingPosition.quantity < 0 && order.side === 'BUY')     // Short position, buying
            );
            
            if (!isClosingOrder) {
              // Trying to add to position - block it
              return {
                success: false,
                message: '❌ Cannot add to existing position. Concurrent trades are disabled. Close current position first.',
              };
            }
          } else {
            // There's an open position in a different symbol - block new position
            return {
              success: false,
              message: `❌ Cannot open new position. You have an open position in ${openPositions[0].symbol}. Close it first (concurrent trades disabled).`,
            };
          }
        }
      }

      // Read session synchronously from localStorage — zero latency
      const storedAuth = localStorage.getItem("kotak_session");
      if (!storedAuth) throw new Error("Session not found. Please login again.");

      const session = JSON.parse(storedAuth);
      const { tradingToken, tradingSid, baseUrl } = session;
      if (!tradingToken || !tradingSid || !baseUrl) {
        throw new Error("Invalid session — missing credentials. Please login again.");
      }

      const consumerKey = process.env.NEXT_PUBLIC_KOTAK_CONSUMER_KEY!;

      // Kotak Neo order type codes: "MKT" | "L" | "SL" | "SL-M"
      const isMarketOrder = (ot: string) => ot === "MKT" || ot === "SL-M";

      const sendOrder = async (overrides: Partial<typeof order> = {}) => {
        const o = { ...order, ...overrides };
        const payload = {
          action:       "placeOrder",
          tradingToken, tradingSid, baseUrl, consumerKey,
          userId:       userIdRef.current, // cached at mount — no await needed
          am:  "NO",
          dq:  "0",
          es:  o.exchSeg,
          mp:  "0",
          pc:  o.productType,
          pf:  "N",
          pr:  String(isMarketOrder(o.orderType) ? 0 : o.price),
          pt:  o.orderType,
          qty: String(o.quantity),
          rt:  "DAY",
          tp:  String(o.orderType === "SL" || o.orderType === "SL-M" ? (o.triggerPrice ?? 0) : 0),
          tt:  o.side === "BUY" ? "B" : "S",
          ts:  o.trdSymbol,
        };

        const res = await fetch("/api/kotak/trade", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { return { ok: false, data: null, raw: text }; }
        return { ok: res.ok, data, raw: text };
      };

      let { ok, data } = await sendOrder();

      // Fallback: if MKT order rejected (stCode 1041), retry as LIMIT @ cached LTP
      if (!ok && data?.details?.stCode === 1041 && order.orderType === "MKT") {
        const cached = getMarketDataStreamService().getLatestPrice(
          `${order.exchSeg.toLowerCase()}|${order.trdSymbol}`
        );
        const limitPrice = cached && cached.ltp > 0 ? cached.ltp : 0;
        const retry = await sendOrder({ orderType: "L", price: limitPrice });
        ok   = retry.ok;
        data = retry.data;
        if (ok && data?.data?.nOrdNo) {
          // Refresh in background — don't block the success response
          void trading.refreshData().then(() => setLastRefreshed(new Date()));
          return {
            success: true,
            message: `✅ Order placed as LIMIT @ ₹${limitPrice} (MKT rejected). ID: ${data.data.nOrdNo}`,
          };
        }
      }

      if (ok && data?.data?.nOrdNo) {
        // Refresh in background — UI shows success immediately
        void trading.refreshData().then(() => setLastRefreshed(new Date()));
        return { success: true, message: `✅ Order Placed! ID: ${data.data.nOrdNo}` };
      }

      const kotakMsg = data?.details?.errMsg || data?.details?.emsg || data?.error || "Order placement failed";
      return { success: false, message: `❌ ${kotakMsg}` };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Order failed" };
    }
  };

  const totalPnL = trading.positions.reduce((sum: number, p: any) => sum + (p.pnl ?? 0), 0);

  // ─── Render ───────────────────────────────────────────────────────────────

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
              totalPnL >= 0
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}>
              {totalPnL >= 0 ? "+" : ""}₹{totalPnL.toFixed(2)}
            </div>
          )}

          {/* Trading status badge + Deactivate button */}
          {tradingEnabled !== null && (
            <div className="flex items-center gap-1.5">

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

              {tradingEnabled && (
                <DeactivateTradingButton onDeactivated={refreshTradingStatus} />
              )}

              {/* Rules tooltip */}
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
            <span className="text-xs text-gray-400 hidden lg:inline">
              {lastRefreshed.toLocaleTimeString()}
            </span>
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
              showResync
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-200 text-gray-500 hover:text-blue-600"
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
            {trading.isLoading
              ? <Loader2 size={12} className="animate-spin" />
              : trading.isConnected
                ? <WifiOff size={12} />
                : <Wifi size={12} />}
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
          <p className="text-xs text-orange-800 font-semibold flex-1">
            Session expired — please login again to continue trading.
          </p>
          <button
            onClick={() => onSessionExpired?.()}
            className="text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded font-bold flex-shrink-0"
          >
            Login Again
          </button>
        </div>
      )}

      {/* Error Banner */}
      {trading.error && !trading.sessionExpired && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle size={13} className="text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 flex-1 truncate">{trading.error}</p>
          <button
            onClick={handleManualRefresh}
            className="text-xs text-red-600 underline hover:text-red-800 flex-shrink-0"
          >
            Retry
          </button>
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
            <Watchlist
              onSelectScrip={handleWatchlistSelect}
              niftyLTP={niftyLTP}
              onLTPUpdate={handleLTPUpdate}
            />
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
              isPinned={isPinned}
              onTogglePin={handleTogglePin}
              hasOpenPositions={trading.positions.filter(p => (p.quantity || 0) !== 0).length > 0}
              openPositionSymbol={trading.positions.filter(p => (p.quantity || 0) !== 0)[0]?.symbol}
              onPlaceOrder={handlePlaceOrder}
              onClear={() => {
                // Only clear if not pinned
                if (!isPinned) {
                  setSelectedScrip(null);
                  setSelectedScripLTP(undefined);
                }
              }}
            />
          </div>
        </div>

        {/* RIGHT: Tabs */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
          <div className="flex border-b border-gray-200 flex-shrink-0 bg-gray-50">

            <button
              onClick={() => setBottomTab("positions")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "positions"
                  ? "border-blue-500 text-blue-600 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <TrendingUp size={12} />
              Positions
              {trading.positions.length > 0 && (
                <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 rounded-full font-bold">
                  {trading.positions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setBottomTab("orders")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "orders"
                  ? "border-blue-500 text-blue-600 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <LayoutList size={12} />
              Orders
              {trading.orders.length > 0 && (
                <span className="ml-1 bg-gray-200 text-gray-600 text-xs px-1.5 rounded-full font-bold">
                  {trading.orders.length}
                </span>
              )}
              {(() => {
                const buyFilled = trading.orders.filter((o) => {
                  const s = (o.status || "").toLowerCase();
                  return (s.includes("complete") || s === "traded") && o.side?.toUpperCase() === "BUY";
                }).length;
                return buyFilled > 0 ? (
                  <span className="ml-0.5 bg-green-100 text-green-700 text-xs px-1.5 rounded-full font-bold">
                    B✓{buyFilled}
                  </span>
                ) : null;
              })()}
              {(() => {
                const sellFilled = trading.orders.filter((o) => {
                  const s = (o.status || "").toLowerCase();
                  return (s.includes("complete") || s === "traded") && o.side?.toUpperCase() === "SELL";
                }).length;
                return sellFilled > 0 ? (
                  <span className="ml-0.5 bg-red-100 text-red-600 text-xs px-1.5 rounded-full font-bold">
                    S✓{sellFilled}
                  </span>
                ) : null;
              })()}
            </button>

            <button
              onClick={() => setBottomTab("chain")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "chain"
                  ? "border-blue-500 text-blue-600 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              📈 Options Chain
            </button>

            <button
              onClick={() => setBottomTab("alerts")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "alerts"
                  ? "border-blue-500 text-blue-600 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              🔔 Alerts
            </button>

            <button
              onClick={() => setBottomTab("ai")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
                bottomTab === "ai"
                  ? "border-blue-500 text-blue-600 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
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
                onExit={async (position) => {
                  // Pre-fill order form with SELL order for this position
                  const token = position.tok || position.token || position.p_tok || '';
                  const exchange = position.exSeg || position.exchange || position.p_exch_seg || 'nse_fo';
                  const trdSymbol = position.trdSym || position.symbol || position.p_trd_symbol || '';
                  
                  // Fetch lot size from database
                  let lotSize = 75; // Default for NIFTY options
                  try {
                    const { data } = await supabase
                      .from('scrip_master')
                      .select('l_lot_size')
                      .eq('p_trd_symbol', trdSymbol)
                      .eq('segment', exchange)
                      .single();
                    if (data?.l_lot_size) lotSize = data.l_lot_size;
                  } catch (err) {
                    console.warn('[TradingPanel] Could not fetch lot size, using default:', err);
                  }
                  
                  setSelectedScrip({
                    id: 0,
                    p_symbol: position.symbol,
                    p_trd_symbol: trdSymbol,
                    p_exch_seg: exchange,
                    p_tok: token,
                    segment: exchange,
                    l_lot_size: lotSize,
                    p_instr_name: position.symbol,
                  });
                  setDefaultSide('SELL');
                  // Don't set cached LTP - let WebSocket update it with live price
                  setSelectedScripLTP(undefined);
                }}
                onRefresh={handleManualRefresh}
              />
            ) : bottomTab === "orders" ? (
              <OrdersTable
                orders={trading.orders as any}
                isLoading={trading.isLoading}
                onCancel={async (id) => {
                  await trading.cancelOrder(id);
                  await trading.refreshData();
                  setLastRefreshed(new Date());
                }}
                onModify={async (id, price, qty, fullOrder) => {
                  await trading.modifyOrder(id, price, qty, fullOrder);
                  await trading.refreshData();
                  setLastRefreshed(new Date());
                }}
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