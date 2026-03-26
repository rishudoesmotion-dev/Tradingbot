// src/lib/services/GeminiService.ts
//
// Sends a structured MarketSnapshot to Gemini 1.5 Flash.
// Returns a market sentiment summary string.

// ─── Types (shared with MarketDataService) ────────────────────────────────────

export interface Candle5m {
  open: number; high: number; low: number; close: number;
  volume: number; openMs: number;
}

export type BuildupLabel = 'Long Buildup' | 'Short Buildup' | 'Long Unwind' | 'Short Cover' | 'Neutral';

export interface OptionStrikeData {
  symbol:        string;
  strike:        number;
  type:          'CE' | 'PE';
  ltp:           number;
  oi:            number;
  oi_change:     number;
  oi_change_pct: number;
  volume:        number;
  iv:            number;     // % e.g. 18.5
  iv_skew:       number;     // PE_IV - CE_IV in pp
  delta:         number;
  gamma:         number;
  theta:         number;
  vega:          number;
  buildup:       BuildupLabel;
  candle_5m:     Candle5m;
}

export interface MarketSnapshot {
  timestamp:    string;
  mode:         'candle_close' | 'trade_mode';
  nifty_ltp:    number;
  atm_strike:   number;
  nifty_candle: Candle5m;
  options:      OptionStrikeData[];
  hdfcbank: { ltp: number; ema9: number; ema21: number };
  reliance: { ltp: number; ema9: number; ema21: number };
}

export interface GeminiAnalysis {
  sentiment:     'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score:         number;       // -100 to +100
  summary:       string;       // 2-3 sentence human-readable summary
  key_signals:   string[];     // bullet points
  raw:           string;       // full Gemini response
  timestamp:     string;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(snapshot: MarketSnapshot): string {
  const { nifty_ltp, atm_strike, nifty_candle, options, hdfcbank, reliance, mode, timestamp } = snapshot;

  // Format options table
  const optRows = options.map(o => {
    const dist = o.strike - atm_strike;
    return `${o.type} ${o.strike} (${dist >= 0 ? '+' : ''}${dist}): LTP=${o.ltp.toFixed(1)} OI=${o.oi.toLocaleString()} OI_Δ=${o.oi_change >= 0 ? '+' : ''}${o.oi_change.toLocaleString()} IV=${o.iv.toFixed(1)}% δ=${o.delta.toFixed(3)} γ=${o.gamma.toFixed(4)} θ=${o.theta.toFixed(2)} Buildup=${o.buildup} Candle=[O:${o.candle_5m.open} H:${o.candle_5m.high} L:${o.candle_5m.low} C:${o.candle_5m.close}]`;
  }).join('\n');

  return `You are an expert NSE options market analyst. Analyze this real-time market snapshot and provide a concise sentiment summary.

## Market Snapshot
Time: ${timestamp}  Mode: ${mode === 'candle_close' ? '5-minute candle just closed' : 'Live trade mode (10s feed)'}

### NIFTY 50
Spot: ${nifty_ltp.toFixed(2)}  ATM: ${atm_strike}
5m Candle: O=${nifty_candle.open} H=${nifty_candle.high} L=${nifty_candle.low} C=${nifty_candle.close}

### NIFTY Options (±5 ATM strikes, weekly expiry)
${optRows}

### Heavyweight Stocks
HDFCBANK: LTP=${hdfcbank.ltp.toFixed(2)}  EMA9=${hdfcbank.ema9.toFixed(2)}  EMA21=${hdfcbank.ema21.toFixed(2)}  ${hdfcbank.ltp > hdfcbank.ema9 ? '▲ above EMA9' : '▼ below EMA9'}
RELIANCE:  LTP=${reliance.ltp.toFixed(2)}  EMA9=${reliance.ema9.toFixed(2)}  EMA21=${reliance.ema21.toFixed(2)}  ${reliance.ltp > reliance.ema9 ? '▲ above EMA9' : '▼ below EMA9'}

## Instructions
Respond ONLY with a valid JSON object. No markdown, no explanation outside JSON.

{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "score": <integer -100 to +100>,
  "summary": "<2-3 sentences explaining overall market sentiment and what the options data tells you>",
  "key_signals": [
    "<signal 1>",
    "<signal 2>",
    "<signal 3>",
    "<signal 4>"
  ]
}

Focus on:
1. Put-Call ratio from OI (high PE OI = bearish hedge / bullish contrarian signal)
2. IV skew direction (PE > CE IV = fear / bearish pressure)
3. Buildup patterns (Short Buildup in CE = bearish; Long Buildup in PE = bearish)
4. EMA position of HDFCBANK and Reliance vs NIFTY direction
5. 5m candle structure (bullish/bearish engulfing, doji etc.)
`;
}

// ─── GeminiService ────────────────────────────────────────────────────────────

export class GeminiService {
  private apiKey: string;
  private endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(snapshot: MarketSnapshot): Promise<string> {
    try {
      const prompt = buildPrompt(snapshot);

      const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:     0.3,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API ${response.status}: ${err.slice(0, 200)}`);
      }

      const data = await response.json();
      const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      console.log('[GeminiService] Raw response:', raw.slice(0, 300));
      return raw;
    } catch (err) {
      console.error('[GeminiService] analyze error:', err);
      return '';
    }
  }

  parseAnalysis(raw: string, timestamp: string): GeminiAnalysis | null {
    try {
      const clean  = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        sentiment:   parsed.sentiment   ?? 'NEUTRAL',
        score:       parsed.score       ?? 0,
        summary:     parsed.summary     ?? '',
        key_signals: parsed.key_signals ?? [],
        raw,
        timestamp,
      };
    } catch {
      console.error('[GeminiService] Failed to parse response:', raw.slice(0, 200));
      return null;
    }
  }
}