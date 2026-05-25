# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
应用于浏览器 Microsoft Edge 版本84.0.522.49(官方内部版本)(64位)

This is a Chrome extension (Manifest V3) that monitors odds/index changes on titan007.com football betting website. When Asian Handicap or Over/Under odds fluctuate beyond configured thresholds (either by percentage or absolute value), the extension captures and displays the data.

**Target URL**: https://live.titan007.com/indexall.aspx

**Detection Modes**:
- **Percentage Mode**: Triggers when odds change by a percentage (e.g., 10%)
- **Absolute Value Mode**: Triggers when odds change by an absolute value (e.g., 0.10)

## Architecture

### Chrome Extension Components

**manifest.json**
- Manifest V3 configuration
- Content scripts inject into `live.titan007.com/indexall.aspx` and related pages
- Permissions: `activeTab`, `storage`, `scripting`
- Host permissions restricted to `*.titan007.com`

**content.js** (1023 lines)
- Injected into target pages to monitor DOM changes
- Key responsibilities:
  - Parses match data from page HTML and `window.sData` global object
  - Extracts Asian Handicap (让球) and Over/Under (大小) odds from DOM elements and attributes
  - Compares current odds against historical data stored in `matchHistory`
  - Detects significant odds changes based on percentage thresholds OR absolute value thresholds (user-selectable mode)
  - Automatically clicks "concern/pin" buttons for matches exceeding thresholds
  - Sends change notifications to background script via `chrome.runtime.sendMessage`
  - Creates and manages an in-page overlay drawer to display monitoring results
- Main functions:
  - `parseMatchData()`: Extracts match info from `tr[onclick*="analysis"]` rows
  - `getCrowIndexFromSData()`: Reads odds from `window.sData` array
  - `extractCrowIndexFromDomRow()`: Fallback parser reading from DOM elements
  - `parseOddsDetail()`: Extracts Asian Handicap and Over/Under odds from adjacent `td.oddss` cells
  - `detectCrowChanges()`: Compares current vs previous odds, calculates percentage changes and absolute differences, applies mode-specific thresholds
  - `autoClickConcern()`: Simulates click on page's "addConcern" button to pin matches
  - `createOverlay()`: Builds collapsible in-page UI showing captured changes

**background.js** (120 lines)
- Service worker managing data persistence
- Stores monitoring data in `monitoringData` array
- Handles messages: `CROW_INDEX_CHANGE`, `GET_MONITORING_DATA`, `CLEAR_DATA`
- Updates badge count on extension icon
- Cleans up expired data (24 hour TTL)
- Persists data to `chrome.storage.local`

**popup.html/popup.css/popup.js** (299 lines JS)
- Extension popup UI for viewing and managing monitored matches
- Displays active matches, odds changes, and change percentages
- Controls:
  - Refresh monitoring data
  - Clear all data
  - Export to JSON
- Settings:
  - Detection mode selector (percentage or absolute value)
  - Percentage mode: Asian Handicap threshold (`threshold-asian`), Over/Under threshold (`threshold-total`)
  - Absolute value mode: Asian Handicap absolute threshold (`threshold-asian-absolute`), Over/Under absolute threshold (`threshold-total-absolute`)
  - Refresh interval (3-30 seconds)

### Data Flow

1. **Content Script** parses page → detects odds changes → sends `CROW_INDEX_CHANGE` message
2. **Background Script** receives message → stores in `monitoringData` → persists to `chrome.storage.local`
3. **Popup UI** requests data via `GET_MONITORING_DATA` → displays in table format
4. **In-Page Overlay** listens to storage changes → updates drawer with latest data

### Key Data Structures

**Match Object** (in content.js):
```javascript
{
  id: string,           // Match ID from row attributes
  league: string,
  time: string,
  status: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  crowIndex: {          // Asian Handicap odds
    home: number,
    away: number,
    raw: string,
    source: 'sData' | 'dom_pre' | 'dom_post' | 'dom_goal'
  },
  odds: {
    asian: {            // Asian Handicap
      home: number,     // Home odds
      away: number,     // Away odds
      line: string      // Handicap line (e.g., "0.5")
    },
    total: {            // Over/Under
      over: number,
      under: number,
      line: string      // Total line (e.g., "2.5")
    }
  }
}
```

**Change Detection**:
- Monitors both Asian Handicap (`asian.home`, `asian.away`) and Over/Under (`total.over`, `total.under`)
- Only triggers when handicap/total line remains unchanged (prevents false positives from line shifts)
- Calculates both percentage change: `(|new - old| / old) × 100` AND absolute difference: `|new - old|`
- **Percentage Mode**: Triggers when percentage exceeds `thresholdAsianPercent` or `thresholdTotalPercent`
- **Absolute Value Mode**: Triggers when absolute difference exceeds `thresholdAsianAbsolute` or `thresholdTotalAbsolute`
- Mode selection is exclusive: only ONE mode is active at a time

### DOM Parsing Strategy

Content script uses multiple fallback strategies to extract odds:

1. **Primary**: Read from `window.sData[matchId]` global array
2. **Fallback 1**: Parse `td.oddss` cells adjacent to `#pk_${matchId}` element
3. **Fallback 2**: Parse `goal` attribute from `#pk_${matchId}` element
4. **Fallback 3**: Find first `td.oddss` in row

Match ID extraction priority:
1. Row `id` attribute matching `_(\d+)` pattern
2. `odds` attribute (comma-separated, first value)
3. `#team1_${matchId}` element ID
4. `[aloc]` attribute

## Configuration

**Chrome Storage Keys** (`chrome.storage.local`):
- `detectionMode`: String - `"percentage"` or `"absolute"` (default: `"percentage"`)
- `threshold`: Legacy single threshold (0-200%)
- `thresholdAsian`: Asian Handicap percentage threshold (0.01-200%)
- `thresholdTotal`: Over/Under percentage threshold (0.01-200%)
- `thresholdAsianAbsolute`: Asian Handicap absolute value threshold (0.01-1.0)
- `thresholdOverAbsolute`: Over (大球) absolute value threshold (0.01-1.0)
- `thresholdUnderAbsolute`: Under (小球) absolute value threshold (0.01-1.0)
- `thresholdTotalAbsolute`: Legacy combined Over/Under absolute threshold (0.01-1.0, for backward compatibility)
- `refreshInterval`: Polling interval in seconds (3-30)
- `monitoringData`: Array of captured changes
- `drawerOpen`: Boolean for in-page overlay visibility
- `drawerHeight`: Overlay panel height in pixels

**Default Values**:
- Detection mode: `"percentage"`
- Asian/Total percentage threshold: 0.1 (10%)
- Asian absolute threshold: 0.10
- Over absolute threshold: 0.10
- Under absolute threshold: 0.10
- Total absolute threshold (legacy): 0.10
- Refresh interval: 5000ms (5 seconds)

## Development Workflow

### Loading the Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `footballPlugin/` directory

### Testing Changes

After modifying code:
- **content.js/popup.js/popup.css**: Click extension reload button
- **background.js/manifest.json**: Full extension reload required
- Open browser console on target page to see `[CrowMon]` debug logs

### Debugging

**Content Script Logs**:
```javascript
crowLog("message", data); // Outputs: [CrowMon] message data
```

**Popup Logs**:
Open DevTools on popup by right-clicking extension icon → "Inspect popup"

**Background Logs**:
Go to `chrome://extensions/` → "Inspect views: service worker"

## Important Implementation Details

### Odds Extraction Priority

The extension prioritizes odds sources in this order:
1. `window.sData` array (most reliable)
2. DOM `td.oddss .odds1/.odds2` elements to the left of handicap cell
3. DOM `td.oddss .odds1/.odds2` elements to the right of handicap cell
4. `goal` attribute from handicap cell
5. First `td.oddss` in row (fallback)

### Auto-Pin Mechanism

When odds changes exceed thresholds, `autoClickConcern()` attempts to:
1. Find button: `a[href*="addConcern(${matchId}"][title="添加置顶"]`
2. Verify `img[src*="unTop.png"]` exists
3. Click button via `.click()`
4. Inject script to call page's native `addConcern(matchId, 14)` function

### In-Page Overlay

Creates a collapsible drawer inserted after `#site-header-two` or `#menu`:
- Uses `position: relative` to avoid covering page content
- Resizable via drag handle
- Persists open/closed state and height to storage
- Updates automatically when `chrome.storage.local.monitoringData` changes

### Change Detection Logic

Only triggers when:
1. Match exists in `matchHistory` (requires previous data point)
2. Handicap/total line unchanged (e.g., both old and new have `line: "0.5"`)
3. **Percentage Mode**: Percentage change exceeds threshold, OR **Absolute Value Mode**: Absolute difference exceeds threshold
4. Numeric values are valid (not null, not NaN)

Reason messages use color coding:
- Orange (`#d35400`): Odds increased
- Green (`#27ae60`): Odds decreased

Display format varies by mode:
- **Percentage Mode**: Shows `+12.50%` or `-8.33%`
- **Absolute Value Mode**: Shows `+0.120` or `-0.085`

## File Structure

```
footballPlugin/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for data management
├── content.js             # Injected script for page monitoring
├── popup.html             # Extension popup interface
├── popup.css              # Popup styling
├── popup.js               # Popup logic
├── icon16.svg             # 16×16 icon
├── icon32.svg             # 32×32 icon
├── icon48.svg             # 48×48 icon
├── icon128.svg            # 128×128 icon
├── test.html              # Testing page (not used in production)
└── README.md              # Documentation (Chinese)
```

## Common Modifications

### Switching Detection Modes

Users can switch between percentage and absolute value modes in the popup UI. The mode selection is stored in `chrome.storage.local.detectionMode`.

### Adjusting Thresholds

**In popup UI**: Use the mode selector radio buttons and corresponding threshold inputs.

**In content.js** (for debugging):
```javascript
let detectionMode = 'percentage';       // 'percentage' | 'absolute'
let thresholdAsianPercent = 0.1;        // 10% for Asian Handicap (percentage mode)
let thresholdTotalPercent = 0.1;        // 10% for Over/Under (percentage mode)
let thresholdAsianAbsolute = 0.10;      // 0.10 for Asian Handicap (absolute mode)
let thresholdOverAbsolute = 0.10;       // 0.10 for Over/大球 (absolute mode)
let thresholdUnderAbsolute = 0.10;      // 0.10 for Under/小球 (absolute mode)
```

### Changing Refresh Rate

Modify `refreshMs` in content.js:
```javascript
let refreshMs = 5000;  // 5 seconds
```

### Updating Target URLs

Edit `manifest.json` content_scripts matches:
```json
"matches": [
  "https://live.titan007.com/indexall.aspx*",
  "https://live.titan007.com/oldIndexall.aspx*"
]
```

### Modifying DOM Selectors

If website structure changes, update selectors in content.js:
- Match rows: `tr[onclick*="analysis"]`
- Odds cells: `td.oddss`
- Odds values: `.odds1`, `.odds2`, `.odds4`
- Handicap cell: `#pk_${matchId}`

