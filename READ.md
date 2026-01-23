# Trading Day Auto Toolkit

Static GitHub Pages tool:
- Enter tickers
- Click "Fetch & Analyze"
- Tool downloads historical daily prices (no API key) and ranks tickers by momentum + trend filter.

## Deploy (GitHub Pages)
1. Create repo: `tradingday-toolkit`
2. Add: index.html, style.css, app.js, README.md
3. Settings → Pages → Deploy from branch → main / root
4. Open your site:
   https://YOUR-USERNAME.github.io/tradingday-toolkit/

## Data Source
Uses Stooq CSV endpoints (no key):
https://stooq.com/q/d/l/?s=aapl.us&i=d

If your network blocks Stooq, tell me and I’ll provide an alternate approach.
