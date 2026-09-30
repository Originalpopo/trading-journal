# TradeJournal

A personal trading journal: import trade history from TradingView (Eightcap), tag trades with
checklists, and review performance, drawdown, calendar and per-trade charts.

Static Next.js app (`output: "export"`) deployed to GitHub Pages; data lives in Firestore and is
read and written directly from the browser.

## Setup

```bash
npm install
npm run dev      # http://localhost:3000/trading-journal
npm test         # unit tests (node --test, Node 24+)
```

`.env.local` needs `NEXT_PUBLIC_TWELVEDATA_API_KEY` for the candlestick charts.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/nextjs.yml`). The workflow
reads the chart API key from the repository secret `TWELVEDATA_API_KEY`.

## Access

- Sign-in is Google via Firebase Auth. Only the owner's UID may read or write: see
  [`firestore.rules`](firestore.rules), which is pasted into the Firebase Console by hand.
- The 4-digit PIN (Settings) is an extra lock on top of sign-in, not the security boundary.

## Data notes

- **Firestore collections:** `trades`, `funding`, `notes`, `settings`, and `chartCache` (candles per
  trade and timeframe, safe to delete; they are refetched on demand).
- **Stats rules** (break-even band, profit factor, drawdowns, ...) live in `src/lib/stats.ts`.
- **Exit times from TradingView:** the "Update Time" of a filled Stop Loss / Take Profit is when
  that order was last placed or moved, not when it was hit. The parser
  (`src/lib/tradingViewParser.ts`) takes the exit time from the cancel of the other side of the
  bracket instead, and marks each trade `exact`, `estimated` or `uncertain`. Times edited by hand
  are marked `manual` and are never overwritten by a re-import.
