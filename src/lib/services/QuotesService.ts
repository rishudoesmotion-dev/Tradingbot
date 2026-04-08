// src/lib/services/QuotesService.ts
/**
 * Kotak Neo Quotes API Service
 *
 * All requests are proxied through /api/kotak/quotes (server-side) to avoid CORS.
 * Session credentials (tradingToken, tradingSid, baseUrl, consumerKey) must be
 * supplied via setSession() after login before any quote fetch will succeed.
 */

export interface QuoteDepthLevel {
  price: string;
  quantity: string;
  orders: string;
}

export interface QuoteDepth {
  buy: QuoteDepthLevel[];
  sell: QuoteDepthLevel[];
}

export interface QuoteOHLC {
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface Quote {
  // Exchange / symbol identifiers (field names vary by endpoint)
  exchange_token?: string;  // standard
  tk?: string;              // short form used by some endpoints
  pSymbol?: string;         // another form
  display_symbol?: string;  // standard
  sym?: string;             // short form
  tsym?: string;            // trading symbol form
  exchange?: string;
  lstup_time?: string;
  // LTP — Kotak uses different casing in different API versions
  ltp?: string;             // standard lowercase
  ltP?: string;             // capital P (some endpoints)
  lp?: string;              // short form
  last_price?: string;      // full form
  // Other fields
  last_traded_quantity?: string;
  total_buy?: string;
  total_sell?: string;
  last_volume?: string;
  change?: string;
  per_change?: string;
  year_high?: string;
  year_low?: string;
  ohlc?: QuoteOHLC;
  depth?: QuoteDepth;
  [key: string]: unknown;   // allow any other fields from Kotak
}

export interface QuoteResponse {
  success: boolean;
  data?: Quote[];
  error?: string;
  message?: string;
}

export interface QuoteSession {
  tradingToken: string;
  tradingSid: string;
  baseUrl: string;
  consumerKey: string;
}

export class QuotesService {
  private session: QuoteSession | null = null;

  /** Call this after successful Kotak login to enable live quotes */
  setSession(session: QuoteSession) {
    this.session = session;
    console.log('[QuotesService] ✅ Session set – live quotes enabled');
  }

  clearSession() {
    this.session = null;
  }

  /**
   * Fetch live quotes for one or more instruments via the server-side proxy.
   * @param queries - Array of {segment, symbol} to fetch quotes for
   * @param filter  - Filter: all | ltp | ohlc | depth | scrip_details | 52W | circuit_limits | oi
   */
  async getQuotes(
    queries: Array<{ segment: string; symbol: string }>,
    filter: string = 'ltp'
  ): Promise<QuoteResponse> {
    if (queries.length === 0) {
      return { success: false, error: 'No queries provided' };
    }

    // Self-heal: if session was never set (e.g. page refresh), read from localStorage
    if (!this.session && typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem('kotak_session') || '{}');
        if (stored?.tradingToken && stored?.tradingSid && stored?.baseUrl) {
          // consumerKey is now saved in kotak_session (as of the login fix).
          // Fall back to the env var / hardcoded UUID if older session lacks it.
          const consumerKey =
            stored.consumerKey ||
            (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_KOTAK_CONSUMER_KEY) ||
            'c63d7961-e935-4bce-8183-c63d9d2342f0';
          this.session = {
            tradingToken: stored.tradingToken,
            tradingSid:   stored.tradingSid,
            baseUrl:      stored.baseUrl,
            consumerKey,
          };
          console.log('[QuotesService] 🔄 Session auto-restored from localStorage');
        }
      } catch { /* ignore */ }
    }

    if (!this.session) {
      console.warn('[QuotesService] ⚠️ No session – cannot fetch live quotes');
      return { success: false, error: 'Not authenticated – call setSession() after login' };
    }

    try {
      const { tradingToken, tradingSid, baseUrl, consumerKey } = this.session;

      // Build proxy URL
      const params = new URLSearchParams({
        queries: JSON.stringify(queries),
        filter,
        tradingToken,
        tradingSid,
        baseUrl,
        consumerKey,
      });

      const proxyUrl = `/api/kotak/quotes?${params.toString()}`;
      console.log('[QuotesService] 📤 Fetching via proxy:', { queries, filter });

      const response = await fetch(proxyUrl);
      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data?.error || `HTTP ${response.status}`;
        console.error('[QuotesService] ❌ Proxy error:', errorMsg);
        return { success: false, error: errorMsg };
      }

      const quotesArray: Quote[] = data.data || [];
      console.log('[QuotesService] ✅ Quotes fetched:', quotesArray.length, 'instruments');

      return { success: true, data: quotesArray };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[QuotesService] ❌ Error fetching quotes:', error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Batch LTP fetch – returns a map of symbol → ltp number.
   * Efficient: single API call for all symbols at once.
   */
  async getBatchLTP(
    queries: Array<{ segment: string; symbol: string }>
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (queries.length === 0) return result;

    const response = await this.getQuotes(queries, 'ltp');
    if (!response.success || !response.data) return result;

    // Log first raw quote to diagnose field names
    if (response.data.length > 0) {
      console.log('[QuotesService] 🔍 Raw first quote:', JSON.stringify(response.data[0]));
    } else {
      console.warn('[QuotesService] ⚠️ getBatchLTP: 0 quotes returned');
    }

    // Index quotes by their position in the response array so we can
    // cross-reference with the original query symbols.
    response.data.forEach((quote: any, idx) => {
      // Kotak uses different casing in different API versions:
      //   "ltp"  — lowercase (standard)
      //   "ltP"  — capital P (some endpoints)
      //   "lp"   — short form
      //   "last_price" — full form
      const rawLtp =
        quote.ltp ??
        quote.ltP ??
        quote.lp ??
        quote.last_price ??
        quote['ltp'] ??
        '0';
      const ltp = parseFloat(String(rawLtp));
      const ltpVal = isNaN(ltp) ? 0 : ltp;

      if (ltpVal <= 0) {
        console.warn(`[QuotesService] ⚠️ Quote idx=${idx} ltpVal=${ltpVal} (raw=${rawLtp}) – keys:`, Object.keys(quote));
        return; // skip zero/bad quotes
      }

      // 1. Key by what Kotak returns as exchange_token (e.g. pSymbol or tok)
      const exchTok = quote.exchange_token ?? quote.tk ?? quote.pSymbol;
      if (exchTok) result.set(String(exchTok), ltpVal);

      // 2. Key by the original query symbol — injected by the proxy as _querySymbol
      const querySym = quote._querySymbol ?? (queries[idx]?.symbol);
      if (querySym) result.set(String(querySym), ltpVal);

      // 3. Also key by display_symbol in case it differs from exchange_token
      const dispSym = quote.display_symbol ?? quote.sym ?? quote.tsym;
      if (dispSym) result.set(String(dispSym), ltpVal);
    });

    console.log('[QuotesService] 📈 getBatchLTP map size:', result.size, '| entries:', Object.fromEntries(result));
    return result;
  }

  /**
   * Fetch LTP (Last Traded Price) for a single instrument.
   * @param exchangeSegment - Exchange segment (e.g. nse_cm)
   * @param symbol          - pSymbol from scrip master
   * @returns LTP as a number (0 if unavailable)
   */
  async getLTP(exchangeSegment: string, symbol: string): Promise<number> {
    console.log('inside ltp', symbol)
    const response = await this.getQuotes(
      [{ segment: exchangeSegment, symbol }],
      'ltp'
    );

    if (!response.success || !response.data || response.data.length === 0) {
      console.warn(`[QuotesService] ⚠️ Failed to get LTP for ${symbol}:`, response.error);
      return 0;
    }

    const q = response.data[0] as any;
    const rawLtp = q.ltp ?? q.ltP ?? q.lp ?? q.last_price ?? '0';
    const ltp = parseFloat(String(rawLtp));
    return isNaN(ltp) ? 0 : ltp;
  }

  /**
   * Fetch full quote data (LTP, OHLC, depth, etc.) for a single instrument.
   */
  async getFullQuote(exchangeSegment: string, symbol: string): Promise<Quote | null> {
    const response = await this.getQuotes(
      [{ segment: exchangeSegment, symbol }],
      'all'
    );

    if (!response.success || !response.data || response.data.length === 0) {
      console.warn(`[QuotesService] ⚠️ Failed to get quote for ${symbol}:`, response.error);
      return null;
    }

    return response.data[0];
  }

  /** Fetch OHLC for one or more instruments */
  async getOHLC(
    queries: Array<{ segment: string; symbol: string }>
  ): Promise<QuoteResponse> {
    return this.getQuotes(queries, 'ohlc');
  }

  /** Fetch order book depth for one or more instruments */
  async getDepth(
    queries: Array<{ segment: string; symbol: string }>
  ): Promise<QuoteResponse> {
    return this.getQuotes(queries, 'depth');
  }

  /** Fetch 52-week high/low */
  async get52W(
    queries: Array<{ segment: string; symbol: string }>
  ): Promise<QuoteResponse> {
    return this.getQuotes(queries, '52W');
  }
}

// Export singleton instance
export const quotesService = new QuotesService();
