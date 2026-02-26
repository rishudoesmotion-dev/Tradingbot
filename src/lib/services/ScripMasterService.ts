// src/lib/services/ScripMasterService.ts
/**
 * Service for managing instrument/scrip master data
 * Downloads and caches CSV files from Kotak API
 */

export interface ScripMasterRecord {
  pSymbol: string;
  pExchSeg: string;
  pTrdSymbol: string;
  lLotSize: number;
  lExpiryDate?: string;
  [key: string]: any;
}

export class ScripMasterService {
  private consumerKey: string;
  private scripCache: Map<string, ScripMasterRecord[]> = new Map();
  private filePathsCache: any = null;
  private lastFetch = 0;
  private CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor(consumerKey: string) {
    this.consumerKey = consumerKey;
  }

  /**
   * Fetch scrip master file paths from API
   */
  async getScripMasterPaths() {
    try {
      // Check cache first
      if (this.filePathsCache && Date.now() - this.lastFetch < this.CACHE_DURATION) {
        console.log('📦 Using cached scrip master paths');
        return this.filePathsCache;
      }

      const params = new URLSearchParams({
        action: 'getScripMasterPaths',
        consumerKey: this.consumerKey,
      });

      console.log('📥 Fetching scrip master file paths...');

      const response = await fetch(`/api/kotak/scrip?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch scrip master paths');
      }

      this.filePathsCache = data.data;
      this.lastFetch = Date.now();

      console.log('✅ Scrip master paths fetched:', {
        files: data.data.filesPaths.length,
        baseFolder: data.data.baseFolder,
      });

      return data.data;
    } catch (error) {
      console.error('❌ Error fetching scrip master paths:', error);
      throw error;
    }
  }

  /**
   * Download a CSV file and parse it
   */
  private async downloadAndParseCSV(
    csvUrl: string,
    segment: string
  ): Promise<ScripMasterRecord[]> {
    try {
      console.log(`📥 Downloading CSV for ${segment}:`, csvUrl);

      const response = await fetch(csvUrl);

      if (!response.ok) {
        throw new Error(`Failed to download CSV: ${response.statusText}`);
      }

      const csvText = await response.text();
      const records = this.parseCSV(csvText);

      console.log(`✅ Parsed ${records.length} records from ${segment}`);

      // Cache the records
      this.scripCache.set(segment, records);

      return records;
    } catch (error) {
      console.error(`❌ Error downloading CSV for ${segment}:`, error);
      throw error;
    }
  }

  /**
   * Parse CSV text into records
   */
  private parseCSV(csvText: string): ScripMasterRecord[] {
    const lines = csvText.trim().split('\n');
    if (lines.length === 0) return [];

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse data rows
    const records: ScripMasterRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const record: any = {};

      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });

      records.push(record as ScripMasterRecord);
    }

    return records;
  }

  /**
   * Search for scripts/instruments by symbol
   */
  async searchBySymbol(
    searchTerm: string,
    segment?: string
  ): Promise<ScripMasterRecord[]> {
    try {
      const paths = await this.getScripMasterPaths();

      if (!segment) {
        // Search across all segments
        const allResults: ScripMasterRecord[] = [];

        for (const csvUrl of paths.filesPaths) {
          const seg = this.extractSegment(csvUrl);
          const records = await this.downloadAndParseCSV(csvUrl, seg);
          const filtered = records.filter(
            r =>
              r.pSymbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              r.pTrdSymbol?.toLowerCase().includes(searchTerm.toLowerCase())
          );
          allResults.push(...filtered);
        }

        return allResults.slice(0, 20); // Limit to 20 results
      } else {
        // Search specific segment
        let cached = this.scripCache.get(segment);

        if (!cached) {
          // Find and download the CSV for this segment
          const csvUrl = paths.filesPaths.find((url: string) =>
            url.includes(segment)
          );

          if (!csvUrl) {
            throw new Error(`No CSV found for segment: ${segment}`);
          }

          cached = await this.downloadAndParseCSV(csvUrl, segment);
        }

        return cached
          .filter(
            r =>
              r.pSymbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              r.pTrdSymbol?.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 20);
      }
    } catch (error) {
      console.error('❌ Error searching scripts:', error);
      throw error;
    }
  }

  /**
   * Get instrument details by token
   */
  async getByToken(token: string, segment?: string): Promise<ScripMasterRecord | null> {
    try {
      const paths = await this.getScripMasterPaths();

      if (!segment) {
        // Search all segments
        for (const csvUrl of paths.filesPaths) {
          const seg = this.extractSegment(csvUrl);
          const records = await this.downloadAndParseCSV(csvUrl, seg);
          const found = records.find(r => r.pSymbol === token);
          if (found) return found;
        }
        return null;
      } else {
        // Search specific segment
        let cached = this.scripCache.get(segment);

        if (!cached) {
          const csvUrl = paths.filesPaths.find((url: string) =>
            url.includes(segment)
          );

          if (!csvUrl) {
            throw new Error(`No CSV found for segment: ${segment}`);
          }

          cached = await this.downloadAndParseCSV(csvUrl, segment);
        }

        return cached.find(r => r.pSymbol === token) || null;
      }
    } catch (error) {
      console.error('❌ Error fetching instrument details:', error);
      throw error;
    }
  }

  /**
   * Extract segment name from CSV URL
   */
  private extractSegment(csvUrl: string): string {
    const match = csvUrl.match(/(nse_cm|bse_cm|nse_fo|bse_fo|cde_fo|mcx_fo)/);
    return match ? match[0] : 'unknown';
  }

  /**
   * Get available segments
   */
  getAvailableSegments(): string[] {
    return ['nse_cm', 'bse_cm', 'nse_fo', 'bse_fo', 'cde_fo', 'mcx_fo'];
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.scripCache.clear();
    this.filePathsCache = null;
    this.lastFetch = 0;
    console.log('🗑️  Scrip master cache cleared');
  }
}
