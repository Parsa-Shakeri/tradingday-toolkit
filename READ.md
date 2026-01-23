# Trading Day Picks (Auto)

A one-button GitHub Pages tool that fetches historical prices and outputs 4 competition-style picks.

## Deploy on GitHub Pages
1. Create a repo (e.g. `tradingday-picks`)
2. Add `index.html`, `app.js`, `README.md`
3. Settings → Pages → Deploy from branch → `main` / root
4. Open: https://YOUR-USERNAME.github.io/tradingday-picks/

## Notes
- Uses Stooq daily CSV endpoints (no API key).
- Outputs 4 picks using a simple momentum + trend filter.
- End-of-day data is intended for weekly rebalance, not day-trading.
