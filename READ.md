# Trading Day Toolkit (Static)

A simple browser-based tool for ranking tickers by short-term momentum (R20/R5),
filtering by trend (Close > MA20 > MA50), and producing target allocations and stop suggestions.

## How to use
1. Download historical CSVs for tickers you care about (Yahoo Finance works).
2. Open the site (locally or via GitHub Pages).
3. Upload CSVs (Date + Close or Adj Close).
4. Click Analyze.

## Deploy to GitHub Pages
1. Create a repo (e.g., `tradingday-toolkit`).
2. Upload `index.html`, `style.css`, `app.js`, `README.md`.
3. Repo Settings → Pages → "Deploy from a branch" → Branch: `main` / root.
4. Your site will appear at: `https://YOUR-USERNAME.github.io/tradingday-toolkit/`

## Notes
- No backend, no API keys, works on school computers.
- Not financial advice.

