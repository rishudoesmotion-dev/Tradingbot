# OI (Open Interest) Chart Implementation

## Overview

The OI Chart feature provides real-time visualization of Open Interest data for NIFTY options with short covering alerts. This implementation includes:

1. **📉 OI Chart Tab** - 4th tab in the trading dashboard
2. **Real-time OI tracking** - ±2 ATM strikes (5 strikes total) for CE & PE
3. **Dual Y-axis chart** - OI (primary) + LTP (secondary) 
4. **Short covering alerts** - Automated detection and persistent alerts
5. **Interactive controls** - Time range selection, line toggles

## Features

### Chart Display
- **Single chart with 10 lines**: 5 strikes × 2 options (CE + PE)
- **Primary Y-axis**: Open Interest (raw numbers like 2,50,000)
- **Secondary Y-axis**: LTP (Last Traded Price) of each option
- **Time window**: Configurable (30min, 1hr, 2hr, 4hr, full session)
- **Auto-refresh**: Every 60 seconds

### Interactive Elements
- **Strike line toggles**: Click to show/hide individual CE/PE lines
- **Color-coded strikes**: Different colors for each strike relative to ATM
- **ATM highlighting**: Clear marking of At-The-Money strike
- **Real-time updates**: Live data refresh without page reload

### Short Covering Alerts
- **Detection logic**: Price↑ + Volume↑ + OI↓ (compared to previous minute)
- **Alert persistence**: Alerts remain until manually cleared
- **Alert display**: List in OI Chart tab only
- **Clear options**: Individual alert clearing or "Clear All"

## Implementation Details

### File Structure
```
src/
├── components/
│   ├── OIChart.tsx              # Main OI Chart component
│   └── TradingDashboard.tsx     # Updated with 4th tab
├── app/api/
│   └── oichart/
│       └── route.ts             # OI data API endpoint
└── supabase/
    └── oi_chart_schema.sql      # Database schema for production
```

### API Endpoints

#### GET /api/oichart
Query parameters:
- `spot` (required): Current NIFTY spot price
- `minutes` (optional): Time range in minutes (default: 60)
- `expiry` (optional): Expiry timestamp

Response:
```json
{
  "success": true,
  "data": {
    "oiData": [...],      // OI data points for chart
    "alerts": [...],      // Short covering alerts
    "strikes": [...],     // Strike prices array
    "atmStrike": 24000,   // At-the-money strike
    "timeRange": {...}    // Time range metadata
  }
}
```

#### POST /api/oichart
For storing real-time OI snapshots (future implementation)

### Database Schema

The `oi_chart_schema.sql` provides production-ready tables:

1. **market_snapshots**: Store minute-by-minute OI data
2. **short_covering_alerts**: Persist alert history
3. **store_market_snapshot()**: Function for automated alert generation
4. **cleanup_old_snapshots()**: Maintenance function

## Configuration

### Color Scheme
Strikes are color-coded relative to ATM:
- **-2 strikes**: Red (CE: #ef4444, PE: #dc2626)
- **-1 strikes**: Orange (CE: #f97316, PE: #ea580c) 
- **ATM (0)**: Blue (CE: #3b82f6, PE: #2563eb)
- **+1 strikes**: Green (CE: #10b981, PE: #059669)
- **+2 strikes**: Purple (CE: #8b5cf6, PE: #7c3aed)

### Alert Thresholds
Short covering detection criteria:
- Price increase > 1%
- Volume increase > 10,000
- OI decrease > 5,000

## Usage

### For Users
1. Navigate to the **📉 OI Chart** tab in the trading dashboard
2. Select time range (30min to full session)
3. Toggle strike lines by clicking colored buttons
4. Monitor short covering alerts in the alerts panel
5. Clear alerts individually or all at once

### For Developers

#### Adding Real Data Integration
1. Implement live market data feed in your trading system
2. Call the POST endpoint to store snapshots:
   ```javascript
   const storeSnapshot = async (oiData) => {
     await fetch('/api/oichart', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ timestamp: Date.now() / 1000, oiSnapshots: oiData })
     });
   };
   ```

3. Run the database schema setup:
   ```sql
   -- Execute supabase/oi_chart_schema.sql in your database
   ```

#### Customizing Alert Logic
Modify the detection criteria in:
- Frontend: `OIChart.tsx` (mock alerts)
- Backend: `oi_chart_schema.sql` (production function)

## Dependencies

New packages added:
- `react-chartjs-2`: React wrapper for Chart.js
- `chart.js`: Charting library

Install with:
```bash
npm install react-chartjs-2 chart.js
```

## Mock Data vs Production

### Current Implementation (Mock)
- Generates random OI data for demonstration
- Sample short covering alerts
- No database persistence

### Production Setup Required
1. Deploy database schema (`oi_chart_schema.sql`)
2. Integrate with live market data feeds
3. Implement real OI tracking in POST endpoint
4. Set up automated cleanup jobs

## Performance Considerations

- **Data retention**: 7 days (configurable in cleanup function)
- **Chart updates**: Max 60-minute window to prevent performance issues
- **Alert throttling**: Built into database function
- **Memory usage**: Limited to 10 chart lines maximum

## Future Enhancements

1. **PCR (Put-Call Ratio) overlay**
2. **Historical OI comparison**
3. **Export chart as image**
4. **Email/SMS alert notifications**
5. **Multiple expiry overlays**
6. **OI heatmaps**

## Troubleshooting

### Common Issues
1. **Chart not loading**: Check console for API errors, verify NIFTY LTP is available
2. **No alerts**: Ensure mock data has variation or real data feed is connected
3. **Performance issues**: Reduce time range or clear browser cache

### Debugging
Enable debug logging by setting `DEBUG = true` in relevant components.

## API Integration Example

```javascript
// Example: Fetch OI data for current NIFTY price
const fetchOIData = async (niftySpot) => {
  const params = new URLSearchParams({
    spot: niftySpot.toString(),
    minutes: '60'
  });
  
  const response = await fetch(`/api/oichart?${params}`);
  const data = await response.json();
  return data;
};
```