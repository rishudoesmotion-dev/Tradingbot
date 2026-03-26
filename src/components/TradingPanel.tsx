"use client";

import { useState, useEffect } from "react";
import { useKotakTrading } from "@/hooks/useKotakTrading";
import { kotakTradingService } from "@/lib/services/KotakTradingService";
import { getDynamicPollingService } from "@/lib/services/DynamicPollingService";
import { tradingRulesService } from "@/lib/services/TradingRulesService";
import { ScripResult } from "@/lib/services/ScripSearchService";
import { isMarketOpen } from "@/lib/utils/marketHours";
import { RiskManager } from "@/lib/risk/RiskManager";
import { createClient } from "@supabase/supabase-js";
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

  // PATCH: undefined = "not yet received" — OrderForm shows ₹ — — — until first WS tick
  // (0 was wrong: OrderForm treats 0 as valid price, causing "₹0.00" flash)
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

  // ── Check trading status on mount; poll every 10s ────────────────────────
  useEffect(() => {
    const checkTradingStatus = async () => {
      try {
        const { isEnabled, reason } =
          await tradingRulesService.isTradingEnabled();
        setTradingEnabled(isEnabled);
        setTradingDisabledReason(reason);
      } catch (error) {
        console.error("[TradingPanel] Failed to check trading status:", error);
        setTradingEnabled(false);
        setTradingDisabledReason("Unable to check status");
      }
    };

    checkTradingStatus();
    const interval = setInterval(checkTradingStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── NIFTY 50 live price via WebSocket (REST fallback) ────────────────────
  // ─── PATCH: Replace the entire NIFTY 50 live price useEffect in TradingPanel.tsx ───
  //
  // The bug: Supabase query was finding an OPTIONS scrip token instead of the
  // NIFTY 50 index. The index LTP (~24,500) was being replaced by an option's
  // LTP (~239).
  //
  // Fix: Use Kotak's KNOWN fixed token for NIFTY 50 index on nse_cm segment.
  // Token "26000" is the standard Kotak NSE NIFTY 50 index token.
  // Falls back to REST polling if WS fails.
  //
  // REPLACE the existing "NIFTY 50 live price via WebSocket" useEffect with this:

  useEffect(() => {
  if (!selectedScrip) return;

  const seg   = (selectedScrip.p_exch_seg || selectedScrip.segment || 'nse_fo').toLowerCase();
  const token = selectedScrip.p_tok ?? selectedScrip.p_symbol; // ← fix here
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
}, [selectedScrip?.p_tok, selectedScrip?.p_exch_seg, trading.isConnected]); // ← also changed dep from p_symbol to p_tok

  useEffect(() => {
    if (!trading.isConnected) return;

    // ── NIFTY 50 index: hardcoded Kotak token ──
    // Token 26000 = NIFTY 50 index on nse_cm. This never changes.
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

    

    // ── REST fallback ──
    const startRestPoll = () => {
      if (cancelled || pollRef) return;
      const doFetch = async () => {
        if (cancelled) return;
        try {
          const result = await kotakTradingService.getLTP(
            NIFTY_TOKEN,
            NIFTY_SEG,
          );
          if (result?.ltp > 0 && !cancelled) {
            setNiftyLTP(result.ltp);
            console.log("[TradingPanel] 📈 NIFTY REST LTP:", result.ltp);
          }
        } catch (err) {
          console.warn("[TradingPanel] ⚠️ NIFTY REST fetch failed:", err);
        }
      };
      doFetch();
      pollRef = setInterval(doFetch, 5000);
    };

    // ── WebSocket primary ──
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
          ws.send(
            JSON.stringify({
              Authorization: session.tradingToken,
              Sid: session.tradingSid,
              type: "cn",
            }),
          );
          heartbeatRef = setInterval(() => {
            if (ws.readyState === 1)
              ws.send(JSON.stringify({ type: "ti", scrips: "" }));
          }, 30_000);
          setTimeout(() => {
            if (ws.readyState === 1) {
              ws.send(
                JSON.stringify({
                  type: "mws",
                  scrips: scripKey,
                  channelnum: 1,
                }),
              );
              console.log("[TradingPanel] 🚀 NIFTY WS subscribed:", scripKey);
            }
          }, 800);
        };

        ws.onmessage = (msgOrEvent: any) => {
          try {
            const raw =
              typeof msgOrEvent === "string" ? msgOrEvent : msgOrEvent?.data;
            if (!raw) return;
            const data = typeof raw === "string" ? JSON.parse(raw) : raw;
            const quotes = Array.isArray(data)
              ? data
              : data?.data
                ? data.data
                : [data];
            for (const q of quotes) {
              if (!q) continue;
              // Only accept ticks whose token matches NIFTY index token
              const tickToken = String(q.tk ?? q.token ?? "");
              if (tickToken && tickToken !== NIFTY_TOKEN) continue;
              const rawLtp = q.ltp ?? q.ltP ?? q.lp ?? q.last_price;
              if (rawLtp === undefined) continue;
              const price = parseFloat(String(rawLtp));
              // NIFTY index is always > 10,000 — guard against option prices leaking in
              if (price > 1000 && !cancelled) {
                setNiftyLTP(price);
                console.log("[TradingPanel] 📈 NIFTY WS LTP:", price);
              }
            }
          } catch {
            /* ignore */
          }
        };

        ws.onerror = () => {
          console.warn("[TradingPanel] NIFTY WS error — falling back to REST");
          startRestPoll();
        };

        ws.onclose = () => {
          if (heartbeatRef) {
            clearInterval(heartbeatRef);
            heartbeatRef = null;
          }
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
      if (wsRef) {
        try {
          wsRef.close();
        } catch {
          /* ignore */
        }
      }
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
        console.log("[TradingPanel] 🚫 Market closed - stopping polling");
        pollingService.stopPolling();
      }
    };

    if (!pollingService.isActive()) {
      console.log(
        `[TradingPanel] 🕐 Market open - starting dynamic polling (positions: ${hasPositions})`,
      );
      pollingService.startPolling(pollCallback, hasPositions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trading.isConnected]);

  // ── Update polling interval when position count changes ──────────────────
  useEffect(() => {
    const pollingService = getDynamicPollingService();
    const hasPositions = trading.positions.length > 0;
    pollingService.updatePositionStatus(hasPositions);
    console.log(
      `[TradingPanel] 📊 Position count: ${trading.positions.length}, Polling interval: ${pollingService.getInterval()}ms`,
    );
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
    console.log("[TradingPanel] 💾 Cached positions tokens to localStorage");
  }, [trading.positions, trading.isConnected]);

  // ── Bubble session expiry to parent ──────────────────────────────────────
  useEffect(() => {
    if (trading.sessionExpired && onSessionExpired) {
      onSessionExpired();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trading.sessionExpired]);

  // ── Live LTP for selected scrip via MarketDataStreamService ─────────────
  // Subscribes to the selected scrip's WS feed directly — no REST polling.
  // Uses the same shared MarketDataStreamService connection as Watchlist/OptionsChain
  // so no new WS connection is opened; just a new subscription on the existing socket.
  // ─── PATCH: Replace the "Live LTP for selected scrip" useEffect ───────────────
  //
  // ROOT CAUSE: getMarketDataStreamService().subscribe() was re-initialising the
  // shared WebSocket every time a scrip was selected. This reset the connection
  // and dropped the NIFTY index subscription, causing niftyLTP to show "--".
  //
  // FIX: Use simple REST polling for the selected scrip LTP instead of the shared
  // WS. The scrip LTP only needs ~2s freshness for order placement — REST is fine.
  // NIFTY index keeps its own dedicated WS untouched.
  //
  // REPLACE the existing "Live LTP for selected scrip via MarketDataStreamService"
  // useEffect with this:

  useEffect(() => {
    if (!selectedScrip) return;

    const seg = (
      selectedScrip.p_exch_seg ||
      selectedScrip.segment ||
      "nse_fo"
    ).toLowerCase();
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
        console.warn("[TradingPanel] selectedScrip LTP fetch failed:", err);
      }
    };

    // Fetch immediately, then every 2 seconds
    fetchLTP();
    const id = setInterval(fetchLTP, 2000);

    return () => {
      cancelled = true;
      clearInterval(id);
      setSelectedScripLTP(undefined);
    };
  }, [selectedScrip?.p_symbol, selectedScrip?.p_exch_seg, trading.isConnected]);

  // ─── Also remove the handleLTPUpdate callback and its prop from <Watchlist> ──
  //
  // The Watchlist onLTPUpdate was a secondary path that also called setSelectedScripLTP
  // from WS ticks — this can now be removed since REST polling handles it above.
  // Change the Watchlist usage from:
  //   <Watchlist onSelectScrip={handleWatchlistSelect} niftyLTP={niftyLTP} onLTPUpdate={handleLTPUpdate} />
  // To:
  //   <Watchlist onSelectScrip={handleWatchlistSelect} niftyLTP={niftyLTP} />
  //
  // And delete the handleLTPUpdate function entirely.

  // ── Live WebSocket for open positions ────────────────────────────────────
  const positionSymbolsKey = trading.positions
    .filter((p) => (p.quantity || 0) !== 0)
    .map(
      (p) => `${(p as any).exchange || "nse_fo"}|${(p as any).tok || p.symbol}`,
    )
    .sort()
    .join(",");

  useEffect(() => {
    if (!trading.isConnected) return;

    const openPositions = trading.positions.filter(
      (p) => (p.quantity || 0) !== 0,
    );
    if (openPositions.length === 0) return;

    const session = JSON.parse(localStorage.getItem("kotak_session") || "{}");
    if (!session?.tradingToken || !session?.tradingSid) {
      console.warn("[TradingPanel] No session for position WebSocket");
      return;
    }

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

    const startPositionWebSocket = () => {
      try {
        const WsClass =
          typeof (window as any).HSWebSocket === "function"
            ? (window as any).HSWebSocket
            : WebSocket;

        const ws = new WsClass("wss://mlhsm.kotaksecurities.com");
        wsRef = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              Authorization: session.tradingToken,
              Sid: session.tradingSid,
              type: "cn",
            }),
          );
          heartbeatRef = setInterval(() => {
            if (ws.readyState === 1)
              ws.send(JSON.stringify({ type: "ti", scrips: "" }));
          }, 30000);
          setTimeout(() => {
            if (ws.readyState === 1) {
              positionScrips.forEach((scrip, idx) => {
                ws.send(
                  JSON.stringify({
                    type: "mws",
                    scrips: scrip,
                    channelnum: idx + 2,
                  }),
                );
                console.log(
                  "[TradingPanel] 📊 Position WebSocket subscribed:",
                  scrip,
                );
              });
            }
          }, 800);
        };

        ws.onmessage = (msgOrEvent: any) => {
          try {
            const raw =
              typeof msgOrEvent === "string" ? msgOrEvent : msgOrEvent?.data;
            if (!raw) return;
            const data = typeof raw === "string" ? JSON.parse(raw) : raw;
            const quotes = Array.isArray(data)
              ? data
              : data?.data
                ? data.data
                : [data];
            for (const q of quotes) {
              if (!q) continue;
              const rawLtp = q.ltp ?? q.ltP ?? q.lp ?? q.last_price;
              if (rawLtp === undefined) continue;
              const price = parseFloat(String(rawLtp));
              if (price <= 0 || cancelled) continue;
              const wsToken = q.tk || q.token || "";
              const wsTrdSym = q.tsym || q.sym || q.display_symbol || "";
              const matchedSym =
                tokenToTrdSym[wsToken] || tokenToTrdSym[wsTrdSym] || "";
              if (matchedSym) {
                trading.updatePositionLTP(matchedSym, price);
                console.log(
                  "[TradingPanel] 📈 Position LTP →",
                  matchedSym,
                  price,
                );
              }
            }
          } catch {
            /* ignore */
          }
        };

        ws.onerror = () =>
          console.warn("[TradingPanel] Position WebSocket error");
        ws.onclose = () => {
          if (heartbeatRef) {
            clearInterval(heartbeatRef);
            heartbeatRef = null;
          }
        };
      } catch (error) {
        console.error(
          "[TradingPanel] Error starting position WebSocket:",
          error,
        );
      }
    };

    startPositionWebSocket();

    return () => {
      cancelled = true;
      if (heartbeatRef) clearInterval(heartbeatRef);
      if (wsRef) {
        try {
          wsRef.close();
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionSymbolsKey, trading.isConnected]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleManualRefresh = async () => {
    await trading.refreshData();
    setLastRefreshed(new Date());
  };

  // Called from Watchlist / OptionsChain B/S buttons.
  // PATCH: reset LTP to undefined (not 0) so OrderForm shows loading state
  // until the first WS tick arrives via handleLTPUpdate below.
  const handleWatchlistSelect = (scrip: ScripResult, side: "BUY" | "SELL") => {
    setSelectedScrip(scrip);
    setDefaultSide(side);
    setSelectedScripLTP(undefined);
  };

  // Watchlist bubbles up WS ticks — secondary path for LTP updates.
  // Primary path is the direct MarketDataStreamService subscription above.
  const handleLTPUpdate = (trdSymbol: string, ltp: number) => {
    setSelectedScrip((current) => {
      if (current && trdSymbol === current.p_trd_symbol) {
        setSelectedScripLTP(ltp);
      }
      return current;
    });
  };

  // Place order via Kotak API — with rule validation + auto-retry as LIMIT on stCode 1041
  const handlePlaceOrder = async (
    order: OrderPayload,
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // ── Step 1: Validate against trading rules ──────────────────────────
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
        console.warn(
          "[TradingPanel] ⛔ Order blocked by trading rules:",
          errorMsg,
        );
        return {
          success: false,
          message: `Trading rule violation: ${errorMsg}`,
        };
      }

      // ── Step 2: Kotak API call ──────────────────────────────────────────
      const storedAuth = localStorage.getItem("kotak_session");
      if (!storedAuth)
        throw new Error("Session not found. Please login again.");

      const session = JSON.parse(storedAuth);
      const { tradingToken, tradingSid, baseUrl } = session;

      if (!tradingToken || !tradingSid || !baseUrl) {
        console.error("[TradingPanel] Session invalid:", {
          hasTradingToken: !!tradingToken,
          hasTradingSid: !!tradingSid,
          hasBaseUrl: !!baseUrl,
          baseUrl,
        });
        throw new Error(
          "Invalid session - missing authentication credentials. Please login again.",
        );
      }

      const consumerKey = "c63d7961-e935-4bce-8183-c63d9d2342f0";

      const sendOrder = async (overrides: Partial<typeof order> = {}) => {
        const o = { ...order, ...overrides };
        const payload = {
          action: "placeOrder",
          tradingToken,
          tradingSid,
          baseUrl,
          consumerKey,
          am: "NO",
          dq: "0",
          es: o.exchSeg,
          mp: "0",
          pc: o.productType,
          pf: "N",
          pr: String(
            o.orderType === "MARKET" || o.orderType === "SL-M" ? 0 : o.price,
          ),
          pt: o.orderType,
          qty: String(o.quantity),
          rt: "DAY",
          tp: String(
            o.orderType === "SL" || o.orderType === "SL-M" ? o.triggerPrice : 0,
          ),
          tt: o.side === "BUY" ? "B" : "S",
          ts: o.trdSymbol,
        };

        console.log("[TradingPanel] 📤 Sending order:", payload);

        const res = await fetch("/api/kotak/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const text = await res.text();
        console.log(
          "[TradingPanel] 📡 Response:",
          res.status,
          text.substring(0, 300),
        );

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          return { ok: false, data: null, raw: text };
        }
        return { ok: res.ok, data, raw: text };
      };

      let { ok, data } = await sendOrder();

      // stCode 1041 = LTP unavailable for market order → auto-retry as LIMIT at LTP
      if (
        !ok &&
        data?.details?.stCode === 1041 &&
        order.orderType === "MARKET"
      ) {
        const ltp = await kotakTradingService.getLTP(
          order.trdSymbol,
          order.exchSeg,
        );
        const limitPrice = ltp.ltp > 0 ? ltp.ltp : 0;
        console.log(
          "[TradingPanel] ⚡ stCode 1041 — auto-retrying as LIMIT @ ₹" +
            limitPrice,
        );
        const retry = await sendOrder({
          orderType: "LIMIT",
          price: limitPrice,
        });
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
        return {
          success: true,
          message: `✅ Order Placed! ID: ${data.data.nOrdNo}`,
        };
      }

      const kotakMsg =
        data?.details?.errMsg ||
        data?.details?.emsg ||
        data?.error ||
        "Order placement failed";
      console.error("[TradingPanel] ❌ Order failed:", data);
      return { success: false, message: `❌ ${kotakMsg}` };
    } catch (err) {
      console.error("[TradingPanel] ❌ Exception during order placement:", err);
      return {
        success: false,
        message: err instanceof Error ? err.message : "Order failed",
      };
    }
  };

  const totalPnL = trading.positions.reduce(
    (sum: number, p: any) => sum + (p.pnl ?? 0),
    0,
  );

  return (
    <div
      className="flex flex-col bg-gray-100 overflow-hidden"
      style={{ height: "100vh" }}
    >
      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div
              className={`w-2.5 h-2.5 rounded-full ${trading.isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
            />
            <span className="text-sm font-bold text-gray-800 hidden sm:inline">
              {trading.isConnected ? "Kotak Neo" : "Disconnected"}
            </span>
          </div>

          {/* Balance chip */}
          {trading.isConnected && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg border border-gray-200 text-sm font-bold text-gray-800 flex-shrink-0">
              <Wallet size={12} className="text-gray-400" />₹
              {trading.balance.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </div>
          )}

          {/* P&L chip */}
          {trading.isConnected && trading.positions.length > 0 && (
            <div
              className={`px-2.5 py-1 rounded-lg border text-sm font-bold flex-shrink-0 ${
                totalPnL >= 0
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {totalPnL >= 0 ? "+" : ""}₹{totalPnL.toFixed(2)}
            </div>
          )}

          {/* Trading status badge */}
          {tradingEnabled !== null && (
            <div className="flex items-center gap-1">
              <div
                className={`px-2.5 py-1 rounded-lg border text-sm font-bold flex items-center gap-1 flex-shrink-0 ${
                  tradingEnabled
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
                title={tradingDisabledReason || "Trading is enabled"}
              >
                {tradingEnabled ? (
                  <>
                    <CheckCircle size={14} />
                    <span className="hidden sm:inline">Trading ON</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    <span className="hidden sm:inline">Trading OFF</span>
                  </>
                )}
              </div>

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
                  <Info
                    size={14}
                    className={
                      tradingEnabled ? "text-green-600" : "text-red-600"
                    }
                  />
                </button>

                {showRules && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-gray-900 text-white text-xs rounded-lg p-4 shadow-2xl z-50 border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <p className="font-semibold">📋 Trading Rules</p>
                      <button
                        onClick={() => setShowRules(false)}
                        className="text-gray-400 hover:text-white text-lg leading-none"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span>Only NIFTY Options (CE/PE)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span>Max 1 lot per order</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span>Max 3 trades per day</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span>No concurrent live trades</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <p className="text-gray-400 text-xs">
                        Master switch (Rule -1) must be enabled to trade
                      </p>
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
                <span>
                  ₹
                  {niftyLTP.toLocaleString("en-IN", {
                    maximumFractionDigits: 0,
                  })}
                </span>
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
              <RefreshCw
                size={14}
                className={trading.isLoading ? "animate-spin" : ""}
              />
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
            onClick={() =>
              trading.isConnected ? trading.disconnect() : trading.connect()
            }
            disabled={trading.isLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
              trading.isConnected
                ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
            }`}
          >
            {trading.isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : trading.isConnected ? (
              <WifiOff size={12} />
            ) : (
              <Wifi size={12} />
            )}
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
          <p className="text-xs text-red-700 flex-1 truncate">
            {trading.error}
          </p>
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
            <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              Watchlist
            </h2>
          </div>
          <div className="flex-1 overflow-hidden">
            {/* PATCH: added niftyLTP + onLTPUpdate props */}
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
            <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              Place Order
            </h2>
          </div>
          <div className="flex-1 overflow-auto">
            {/* PATCH: currentLTP is now number | undefined — undefined shows loading state */}
            <OrderForm
              selectedScrip={selectedScrip}
              defaultSide={defaultSide}
              isConnected={trading.isConnected}
              isLoading={trading.isLoading}
              currentLTP={selectedScripLTP}
              onPlaceOrder={handlePlaceOrder}
              onClear={() => {
                setSelectedScrip(null);
                setSelectedScripLTP(undefined); // PATCH: undefined not 0
              }}
            />
          </div>
        </div>

        {/* RIGHT: Positions / Orders / Chain */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
          {/* Tabs */}
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
              {trading.orders.filter((o) => {
                const s = (o.status || "").toLowerCase();
                return (
                  (s.includes("complete") || s === "traded") &&
                  o.side?.toUpperCase() === "BUY"
                );
              }).length > 0 && (
                <span className="ml-0.5 bg-green-100 text-green-700 text-xs px-1.5 rounded-full font-bold">
                  B✓
                  {
                    trading.orders.filter((o) => {
                      const s = (o.status || "").toLowerCase();
                      return (
                        (s.includes("complete") || s === "traded") &&
                        o.side?.toUpperCase() === "BUY"
                      );
                    }).length
                  }
                </span>
              )}
              {trading.orders.filter((o) => {
                const s = (o.status || "").toLowerCase();
                return (
                  (s.includes("complete") || s === "traded") &&
                  o.side?.toUpperCase() === "SELL"
                );
              }).length > 0 && (
                <span className="ml-0.5 bg-red-100 text-red-600 text-xs px-1.5 rounded-full font-bold">
                  S✓
                  {
                    trading.orders.filter((o) => {
                      const s = (o.status || "").toLowerCase();
                      return (
                        (s.includes("complete") || s === "traded") &&
                        o.side?.toUpperCase() === "SELL"
                      );
                    }).length
                  }
                </span>
              )}
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

          {/* Tab content */}
          <div className="flex-1 overflow-hidden min-h-0">
            {bottomTab === "positions" ? (
              <PositionsTable
                positions={trading.positions as any}
                isLoading={trading.isLoading}
                onExit={async (symbol) => {
                  await trading.exitPosition(symbol);
                  await trading.refreshData();
                  setLastRefreshed(new Date());
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
                onRefresh={handleManualRefresh}
              />
            ) : bottomTab === "chain" ? (
              <div className="p-4 overflow-auto h-full">
                <OptionsChain
                  onSelectScrip={handleWatchlistSelect}
                  niftyLTP={niftyLTP}
                />
              </div>
            ) : bottomTab === "alerts" ? (
              <PriceAlerts currentPrice={niftyLTP} />
            ) : bottomTab === "ai" ? (
              <div className="h-full overflow-hidden">
                <AIAnalysisPanel
                  niftyLTP={niftyLTP}
                  isConnected={trading.isConnected}
                />
              </div>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
