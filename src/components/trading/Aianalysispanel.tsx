  'use client';

  // src/components/trading/AIAnalysisPanel.tsx
  //
  // Panel inside TradingPanel that:
  //  - Shows Gemini market sentiment (updated on every 5m candle close)
  //  - Has a "Trade Mode" toggle button that feeds data every 10s
  //  - Displays latest snapshot metrics
  //  - Shows signal history log

  import { useState, useEffect, useRef, useCallback } from 'react';
  import { Brain, Zap, Activity, TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle } from 'lucide-react';
  import { GeminiService, GeminiAnalysis, MarketSnapshot } from '@/lib/services/GeminiService';
  import { getMarketDataService } from '@/lib/services/MarketDataService';

  interface AIAnalysisPanelProps {
    niftyLTP:    number | null;
    isConnected: boolean;
  }

  interface LogEntry {
    id:        string;
    timestamp: string;
    mode:      'candle_close' | 'trade_mode';
    analysis:  GeminiAnalysis | null;
    rawJson:   string;
  }

  const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '';

  export default function AIAnalysisPanel({ niftyLTP, isConnected }: AIAnalysisPanelProps) {
    const [isTradeMode,   setIsTradeMode]   = useState(false);
    const [isRunning,     setIsRunning]     = useState(false);
    const [latest,        setLatest]        = useState<GeminiAnalysis | null>(null);
    const [snapshot,      setSnapshot]      = useState<MarketSnapshot | null>(null);
    const [log,           setLog]           = useState<LogEntry[]>([]);
    const [error,         setError]         = useState<string | null>(null);
    const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
    const [isFetching,    setIsFetching]    = useState(false);
    const serviceRef = useRef<ReturnType<typeof getMarketDataService> | null>(null);
    const geminiRef  = useRef<GeminiService | null>(null);

    // ── Init service ─────────────────────────────────────────────────────────────

    useEffect(() => {
      if (!GEMINI_KEY) {
        setError('NEXT_PUBLIC_GEMINI_API_KEY not set in .env.local');
        return;
      }
      try {
        const svc = getMarketDataService(GEMINI_KEY);
        serviceRef.current = svc;
        geminiRef.current  = new GeminiService(GEMINI_KEY);

        svc.setCallbacks({
          onSnapshot: (s:any) => {
            setSnapshot(s);
            setLastUpdated(new Date());
            setIsFetching(false);
          },
          onAnalysis: (raw:any) => {
    console.log('[AIPanel] 📨 onAnalysis called, raw length:', raw?.length);
    console.log('[AIPanel] 📨 raw preview:', raw?.slice(0, 200));
    const ts       = new Date().toISOString();
    const analysis = geminiRef.current?.parseAnalysis(raw, ts) ?? null;
    console.log('[AIPanel] 📊 parsed analysis:', analysis);
    setLatest(analysis);
            setLog(prev => [
              {
                id:        `log_${Date.now()}`,
                timestamp: new Date().toLocaleTimeString(),
                mode:      serviceRef.current?.tradeModeActive ? 'trade_mode' : 'candle_close',
                analysis,
                rawJson:   raw,
              },
              ...prev.slice(0, 49), // keep last 50
            ]);
            setIsFetching(false);
          },
          onError: (e) => {
            setError(e);
            setIsFetching(false);
          },
        });
      } catch (e) {
        setError(String(e));
      }

      return () => { serviceRef.current?.stop(); };
    }, []);

    useEffect(() => {
    if (niftyLTP && niftyLTP > 1000 && serviceRef.current) {
      serviceRef.current.setNiftyLTP(niftyLTP);
    }
  }, [niftyLTP]);

    // ── Start/stop candle engine when connected ────────────────────────────────

    useEffect(() => {
      if (!serviceRef.current) return;
      if (isConnected) {
        serviceRef.current.start();
        setIsRunning(true);
      } else {
        serviceRef.current.stop();
        setIsRunning(false);
        setIsTradeMode(false);
      }
    }, [isConnected]);

    // ── Trade Mode toggle ─────────────────────────────────────────────────────

    const handleTradeMode = useCallback(() => {
      if (!serviceRef.current || !isConnected) return;
      const active = serviceRef.current.toggleTradeMode();
      setIsTradeMode(active);
    }, [isConnected]);

    // ── Manual trigger ────────────────────────────────────────────────────────

    const handleManualTrigger = useCallback(async () => {
      if (!serviceRef.current || isFetching) return;
      setIsFetching(true);
      setError(null);
      await serviceRef.current.triggerNow();
    }, [isFetching]);

    // ── Helpers ────────────────────────────────────────────────────────────────

    const sentimentColor = (s?: string) => {
      if (s === 'BULLISH') return '#16a34a';
      if (s === 'BEARISH') return '#dc2626';
      return '#6b7280';
    };

    const sentimentBg = (s?: string) => {
      if (s === 'BULLISH') return '#f0fdf4';
      if (s === 'BEARISH') return '#fef2f2';
      return '#f9fafb';
    };

    const sentimentBorder = (s?: string) => {
      if (s === 'BULLISH') return '#86efac';
      if (s === 'BEARISH') return '#fca5a5';
      return '#e5e7eb';
    };

    const SentimentIcon = ({ s }: { s?: string }) => {
      if (s === 'BULLISH') return <TrendingUp size={18} color="#16a34a" />;
      if (s === 'BEARISH') return <TrendingDown size={18} color="#dc2626" />;
      return <Minus size={18} color="#6b7280" />;
    };

    const ScoreBar = ({ score }: { score: number }) => {
      const pct    = Math.abs(score);
      const isPos  = score >= 0;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 3,
              background: isPos ? '#16a34a' : '#dc2626',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: isPos ? '#16a34a' : '#dc2626', minWidth: 32, textAlign: 'right' }}>
            {score >= 0 ? '+' : ''}{score}
          </span>
        </div>
      );
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    if (!GEMINI_KEY) {
      return (
        <div style={{ padding: 16, color: '#dc2626', fontSize: 12 }}>
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
          Add <code>NEXT_PUBLIC_GEMINI_API_KEY</code> to <code>.env.local</code> and restart.
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', fontSize: 12 }}>

        {/* ── Header ── */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#111827', fontSize: 12 }}>
              <Brain size={14} color="#6366f1" />
              AI Market Analysis
              {isRunning && (
                <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>● LIVE</span>
              )}
            </div>
            {lastUpdated && (
              <span style={{ fontSize: 10, color: '#9ca3af' }}>{lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>

          {/* Control buttons */}
          <div style={{ display: 'flex', gap: 6 }}>

            {/* Trade Mode button */}
            <button
              onClick={handleTradeMode}
              disabled={!isConnected}
              style={{
                flex: 1, padding: '6px 12px', borderRadius: 8, border: 'none',
                fontWeight: 700, fontSize: 11, cursor: isConnected ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                background: isTradeMode ? '#dc2626' : '#111827',
                color: '#fff', opacity: isConnected ? 1 : 0.5,
                boxShadow: isTradeMode ? '0 0 0 3px rgba(220,38,38,0.25)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <Zap size={12} />
              {isTradeMode ? '⏹ Stop Trade Mode' : '▶ Trade Mode'}
            </button>

            {/* Manual trigger */}
            <button
              onClick={handleManualTrigger}
              disabled={!isConnected || isFetching}
              title="Trigger analysis now"
              style={{
                padding: '6px 10px', borderRadius: 8,
                border: '1px solid #e5e7eb', background: '#fff',
                cursor: isConnected && !isFetching ? 'pointer' : 'not-allowed',
                color: '#6b7280', opacity: isConnected ? 1 : 0.5,
              }}
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Trade mode indicator */}
          {isTradeMode && (
            <div style={{
              marginTop: 6, padding: '4px 8px', background: '#fef2f2',
              border: '1px solid #fca5a5', borderRadius: 6,
              fontSize: 10, color: '#dc2626', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Activity size={10} />
              Feeding data to Gemini every 10 seconds
            </div>
          )}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div style={{
            padding: '6px 12px', background: '#fef2f2', borderBottom: '1px solid #fca5a5',
            fontSize: 11, color: '#dc2626', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={12} />
            {error}
          </div>
        )}

        {/* ── Latest analysis card ── */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          {!latest ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>
              {isConnected
                ? isFetching
                  ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline' }} /><br />Analyzing...</>
                  : 'Waiting for next 5m candle close...'
                : 'Connect to broker to start analysis'}
            </div>
          ) : (
            <div style={{
              background: sentimentBg(latest.sentiment),
              border: `1px solid ${sentimentBorder(latest.sentiment)}`,
              borderRadius: 10, padding: 12,
            }}>
              {/* Sentiment header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SentimentIcon s={latest.sentiment} />
                <span style={{ fontWeight: 800, fontSize: 14, color: sentimentColor(latest.sentiment) }}>
                  {latest.sentiment}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af' }}>
                  {new Date(latest.timestamp).toLocaleTimeString()}
                </span>
              </div>

              {/* Score bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>CONFIDENCE SCORE</div>
                <ScoreBar score={latest.score} />
              </div>

              {/* Summary */}
              <p style={{ color: '#374151', lineHeight: 1.5, marginBottom: 10, fontSize: 11 }}>
                {latest.summary}
              </p>

              {/* Key signals */}
              {latest.key_signals?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {latest.key_signals.map((sig, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: '#4b5563' }}>
                      <span style={{ color: sentimentColor(latest.sentiment), flexShrink: 0, marginTop: 1 }}>•</span>
                      <span>{sig}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Snapshot metrics ── */}
        {snapshot && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Latest Snapshot
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { label: 'NIFTY',    value: snapshot.nifty_ltp.toFixed(2) },
                { label: 'ATM',      value: snapshot.atm_strike.toLocaleString('en-IN') },
                { label: 'HDFC LTP', value: snapshot.hdfcbank.ltp.toFixed(2) },
                { label: 'HDFC EMA9',  value: snapshot.hdfcbank.ema9.toFixed(2) },
                { label: 'REL LTP',  value: snapshot.reliance.ltp.toFixed(2) },
                { label: 'REL EMA9',   value: snapshot.reliance.ema9.toFixed(2) },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: '#f9fafb', border: '1px solid #e5e7eb',
                  borderRadius: 6, padding: '5px 8px',
                }}>
                  <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>₹{value}</div>
                </div>
              ))}
            </div>

            {/* ±5 strikes mini table */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>
                Options (±5 ATM)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 2,
                fontSize: 9, fontWeight: 600, color: '#9ca3af', padding: '2px 4px',
                textTransform: 'uppercase' }}>
                <div>Symbol</div><div style={{ textAlign: 'right' }}>LTP</div>
                <div style={{ textAlign: 'right' }}>IV%</div><div style={{ textAlign: 'right' }}>Buildup</div>
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                {snapshot.options.map(o => {
                  const isAtm = o.strike === snapshot.atm_strike;
                  const buildupColor = o.buildup === 'Long Buildup' ? '#16a34a'
                    : o.buildup === 'Short Buildup' ? '#dc2626'
                    : o.buildup === 'Long Unwind' ? '#f59e0b'
                    : o.buildup === 'Short Cover' ? '#3b82f6'
                    : '#9ca3af';
                  return (
                    <div key={o.symbol} style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr',
                      gap: 2, padding: '3px 4px', borderRadius: 4,
                      background: isAtm ? '#eff6ff' : 'transparent',
                      borderLeft: isAtm ? '2px solid #3b82f6' : '2px solid transparent',
                      fontSize: 10,
                    }}>
                      <div style={{ fontWeight: isAtm ? 700 : 500, color: isAtm ? '#1d4ed8' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.type} {o.strike.toLocaleString('en-IN')}
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 600, color: o.type === 'CE' ? '#d97706' : '#2563eb' }}>
                        {o.ltp > 0 ? o.ltp.toFixed(1) : '--'}
                      </div>
                      <div style={{ textAlign: 'right', color: '#6b7280' }}>
                        {o.iv > 0 ? o.iv.toFixed(1) : '--'}
                      </div>
                      <div style={{ textAlign: 'right', color: buildupColor, fontWeight: 600, fontSize: 9 }}>
                        {o.buildup}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Analysis log ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Analysis History
          </div>
          {log.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#d1d5db', padding: '16px 0', fontSize: 11 }}>
              No analysis yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {log.map(entry => (
                <div key={entry.id} style={{
                  padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${sentimentBorder(entry.analysis?.sentiment)}`,
                  background: sentimentBg(entry.analysis?.sentiment),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 11, color: sentimentColor(entry.analysis?.sentiment) }}>
                        {entry.analysis?.sentiment ?? 'ERROR'}
                      </span>
                      {entry.analysis && (
                        <span style={{ fontSize: 10, color: sentimentColor(entry.analysis.sentiment), fontWeight: 600 }}>
                          {entry.analysis.score >= 0 ? '+' : ''}{entry.analysis.score}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#9ca3af' }}>
                      <span style={{
                        padding: '1px 5px', borderRadius: 3,
                        background: entry.mode === 'trade_mode' ? '#fef2f2' : '#f0fdf4',
                        color: entry.mode === 'trade_mode' ? '#dc2626' : '#16a34a',
                        fontWeight: 600,
                      }}>
                        {entry.mode === 'trade_mode' ? '⚡ TRADE' : '🕯 CANDLE'}
                      </span>
                      {entry.timestamp}
                    </div>
                  </div>
                  {entry.analysis?.summary && (
                    <p style={{ fontSize: 10, color: '#4b5563', lineHeight: 1.4, margin: 0 }}>
                      {entry.analysis.summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }