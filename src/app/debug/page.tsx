// src/app/debug/page.tsx - Live API Debug Tool
'use client';

import { useState } from 'react';

export default function DebugPage() {
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [quotesSymbol, setQuotesSymbol] = useState('54883');
  const [quotesSegment, setQuotesSegment] = useState('nse_fo');

  const appendLog = (msg: string) => setOutput(prev => prev + msg + '\n');

  const testAPI = async (action: 'getPositions' | 'getOrders' | 'getUserLimits') => {
    setOutput('');
    setLoading(true);
    try {
      const raw = localStorage.getItem('kotak_session');
      if (!raw) { appendLog('❌ No session in localStorage. Login first.'); return; }

      const session = JSON.parse(raw);
      const { tradingToken, tradingSid, baseUrl } = session;
      const consumerKey = 'c63d7961-e935-4bce-8183-c63d9d2342f0';

      appendLog(`▶ Testing: ${action}`);
      appendLog(`  baseUrl: ${baseUrl}`);
      appendLog(`  token: ${String(tradingToken).substring(0, 30)}...`);
      appendLog(`  sid:   ${String(tradingSid).substring(0, 30)}...`);
      appendLog('');

      const qs = new URLSearchParams({ action, tradingToken, tradingSid, baseUrl, consumerKey });
      const res = await fetch(`/api/kotak/trade?${qs}`);
      const json = await res.json();

      appendLog(`HTTP Status: ${res.status}`);
      appendLog('');
      appendLog('Full proxy response:');
      appendLog(JSON.stringify(json, null, 2));

      if (json?.data) {
        appendLog('');
        appendLog('=== json.data (what callTradingAPI returns) ===');
        appendLog(JSON.stringify(json.data, null, 2));

        if (json.data?.data) {
          appendLog('');
          appendLog(`=== json.data.data (array?, length=${Array.isArray(json.data.data) ? json.data.data.length : 'NOT ARRAY'}) ===`);
          appendLog(JSON.stringify(json.data.data, null, 2));
        }
      }
    } catch (e) {
      appendLog(`❌ Exception: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const testQuotes = async () => {
    setOutput('');
    setLoading(true);
    try {
      const raw = localStorage.getItem('kotak_session');
      if (!raw) { appendLog('❌ No session in localStorage. Login first.'); return; }

      const session = JSON.parse(raw);
      const { tradingToken, tradingSid, baseUrl } = session;
      const consumerKey = 'c63d7961-e935-4bce-8183-c63d9d2342f0';

      const sym = quotesSymbol.trim();
      const seg = quotesSegment;

      // Test 3 formats to see which Kotak accepts
      const variants = [
        { label: 'Token number (NEW FIX – e.g. 54883)', segment: seg, symbol: sym },
        { label: 'trdSym string (e.g. NIFTY2630224900PE)', segment: seg, symbol: 'NIFTY2630224900PE' },
        { label: 'Underlying pSymbol (e.g. NIFTY)', segment: seg, symbol: 'NIFTY' },
      ];

      for (const v of variants) {
        appendLog(`\n─── ${v.label}: ${v.segment}|${v.symbol} ───`);
        const queries = JSON.stringify([{ segment: v.segment, symbol: v.symbol }]);
        const qs = new URLSearchParams({ queries, filter: 'ltp', tradingToken, tradingSid, baseUrl, consumerKey });
        try {
          const res = await fetch(`/api/kotak/quotes?${qs}`);
          const json = await res.json();
          appendLog(`HTTP ${res.status}: ${JSON.stringify(json).substring(0, 300)}`);
          if (json?.data?.[0]) {
            const q = json.data[0];
            const ltpVal = q.ltp ?? q.ltP ?? q.lp ?? q.last_price ?? '(no ltp field)';
            appendLog(`  ✅ exchange_token="${q.exchange_token ?? q.tk}"  ltp="${ltpVal}"  display="${q.display_symbol ?? q.sym}"`);
            appendLog(`     All keys: ${Object.keys(q).join(', ')}`);
          }
        } catch (e) {
          appendLog(`  ❌ Fetch error: ${e}`);
        }
      }

      // Dump raw position fields to see trdSym / sym / exSeg / tok
      appendLog('\n─── Raw positions (first 3) – check tok field ───');
      const posQs = new URLSearchParams({ action: 'getPositions', tradingToken, tradingSid, baseUrl, consumerKey });
      const posRes = await fetch(`/api/kotak/trade?${posQs}`);
      const posJson = await posRes.json();
      const positions: any[] = posJson?.data?.data ?? posJson?.data?.positions ?? [];
      if (positions.length === 0) {
        appendLog('  (no positions returned)');
      } else {
        positions.slice(0, 3).forEach((p: any, i: number) => {
          appendLog(`  [${i + 1}] trdSym="${p.trdSym}"  sym="${p.sym}"  exSeg="${p.exSeg}"  tok="${p.tok}"  ltp="${p.ltp ?? p.ltP}"`);
        });
      }
    } catch (e) {
      appendLog(`❌ Exception: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const testWatchlistLTPs = async () => {
    setOutput('');
    setLoading(true);
    try {
      const raw = localStorage.getItem('kotak_session');
      if (!raw) { appendLog('❌ No session in localStorage. Login first.'); return; }

      const session = JSON.parse(raw);
      const { tradingToken, tradingSid, baseUrl } = session;
      const consumerKey = 'c63d7961-e935-4bce-8183-c63d9d2342f0';

      const wlRaw = localStorage.getItem('scrip_watchlist');
      if (!wlRaw) { appendLog('❌ No watchlist in localStorage.'); return; }
      const watchlist = JSON.parse(wlRaw);
      appendLog(`Watchlist has ${watchlist.length} items:`);

      // Mirror Watchlist.tsx getQuoteSymbol logic exactly:
      // F&O: use p_tok (instrument token) → fallback to p_trd_symbol → p_symbol
      // Equity: use p_symbol
      const queries = watchlist.map((s: any) => {
        const seg = (s.p_exch_seg || s.segment || '').toLowerCase();
        const isFnO = seg.includes('fo');
        const symbol = isFnO
          ? (s.p_tok || s.p_trd_symbol || s.p_symbol)
          : s.p_symbol;
        const hasTok = isFnO && !!s.p_tok;
        appendLog(`  • ${s.p_trd_symbol || s.p_symbol} → [${seg}|${symbol}]${hasTok ? ' ✅ p_tok' : isFnO ? ' ⚠️ no p_tok – using trdSym' : ''}`);
        return { segment: seg, symbol };
      });

      appendLog('\nSending batch LTP request to /api/kotak/quotes ...');
      const qs = new URLSearchParams({
        queries: JSON.stringify(queries),
        filter: 'ltp',
        tradingToken,
        tradingSid,
        baseUrl,
        consumerKey,
      });
      const res = await fetch(`/api/kotak/quotes?${qs}`);
      const json = await res.json();
      appendLog(`HTTP ${res.status}`);
      if (json?.data) {
        appendLog(`Got ${json.data.length} quote(s):`);
        json.data.forEach((q: any, idx: number) => {
          const ltpVal = q.ltp ?? q.ltP ?? q.lp ?? q.last_price ?? '(no ltp field)';
          const chgVal = q.change ?? q.chg ?? q.price_change ?? '(no change)';
          appendLog(`  [${idx}] exchange_token="${q.exchange_token ?? q.tk}"  ltp="${ltpVal}"  change="${chgVal}"  display="${q.display_symbol ?? q.sym}"`);
          appendLog(`       All keys: ${Object.keys(q).join(', ')}`);
        });
      } else {
        appendLog(JSON.stringify(json, null, 2));
      }
    } catch (e) {
      appendLog(`❌ Exception: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 text-green-400 min-h-screen font-mono text-xs">
      <h1 className="text-xl font-bold mb-4 text-white">🔧 Kotak API Debug</h1>
      <p className="text-gray-400 text-xs mb-4">
        Login on the main page first. All reads from localStorage session.
      </p>

      {/* Trading API Tests */}
      <div className="mb-5">
        <h2 className="text-sm font-bold text-yellow-400 mb-2">📊 Trading API</h2>
        <div className="flex gap-3 flex-wrap">
          {(['getPositions', 'getOrders', 'getUserLimits'] as const).map(action => (
            <button
              key={action}
              onClick={() => testAPI(action)}
              disabled={loading}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-bold disabled:opacity-50"
            >
              {loading ? '...' : `Test ${action}`}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes API Tests */}
      <div className="mb-5">
        <h2 className="text-sm font-bold text-yellow-400 mb-2">💰 Quotes API (LTP fix verification)</h2>
        <div className="flex gap-2 mb-2 flex-wrap items-center">
          <select
            value={quotesSegment}
            onChange={e => setQuotesSegment(e.target.value)}
            className="px-3 py-1.5 bg-gray-700 text-white rounded text-xs border border-gray-600"
          >
            <option value="nse_fo">nse_fo (F&amp;O)</option>
            <option value="nse_cm">nse_cm (Equity)</option>
            <option value="bse_fo">bse_fo</option>
            <option value="bse_cm">bse_cm</option>
            <option value="cde_fo">cde_fo</option>
          </select>
          <input
            type="text"
            value={quotesSymbol}
            onChange={e => setQuotesSymbol(e.target.value)}
            placeholder="e.g. 54883 (tok) or NIFTY2631022000PE"
            className="px-3 py-1.5 bg-gray-700 text-white rounded text-xs border border-gray-600 w-64"
          />
          <button
            onClick={testQuotes}
            disabled={loading}
            className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded font-bold disabled:opacity-50"
          >
            {loading ? '...' : 'Test Quotes (3 formats)'}
          </button>
          <button
            onClick={testWatchlistLTPs}
            disabled={loading}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded font-bold disabled:opacity-50"
          >
            {loading ? '...' : 'Test Watchlist LTPs'}
          </button>
        </div>
        <p className="text-gray-500 text-xs">
          "Test Quotes (3 formats)" tries: ① token number (e.g. 54883) ② full trdSym ③ bare pSymbol.
          Token number is what Kotak actually requires for F&amp;O options.
          "Test Watchlist LTPs" mirrors the exact fixed Watchlist query (uses p_tok when available).
        </p>
      </div>

      <button
        onClick={() => setOutput('')}
        className="mb-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
      >
        Clear Output
      </button>

      <pre className="bg-gray-800 p-4 rounded text-xs whitespace-pre-wrap break-all overflow-auto max-h-[60vh]">
        {output || 'Click a button above to test. Results appear here.'}
      </pre>
    </div>
  );
}
