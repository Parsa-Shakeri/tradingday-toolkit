// One-button Trading Day Picks
// Data: Stooq daily CSV (no API key): https://stooq.com/q/d/l/?s=aapl.us&i=d
// Strategy baked in:
// - Filter: last price >= $5
// - Trend: Close > MA20 > MA50
// - Momentum score: 0.7*R20 + 0.3*R5
// - Output: top 4 picks from a curated universe (US mega-caps + liquid ETFs)
// NOTE: Uses end-of-day data (perfect for weekly rebalance).

const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
document.getElementById("go").addEventListener("click", run);

const MIN_PRICE = 5;
const PICKS_N = 4;

// Curated universe: liquid US stocks + ETFs (keeps it fast + realistic for a school tool)
const UNIVERSE = [
  // Broad market / style
  "SPY","QQQ","IWM","DIA",
  // Tech + growth leaders
  "NVDA","MSFT","AAPL","AMZN","META","GOOGL","AVGO","AMD","TSLA",
  // Sector ETFs (momentum-friendly)
  "XLK","XLY","XLF","XLE","XLI","XLV",
  // Semis / innovation ETFs
  "SMH","SOXX",
  // Volatility / risk-on proxies (optional but liquid)
  "ARKK",
  // Quality large caps
  "COST","LLY","UNH","JPM","V","MA","NFLX"
];

async function run() {
  status("Fetching prices…");
  outEl.innerHTML = `<p class="small">Working…</p>`;

  const results = [];
  let ok = 0, bad = 0;

  // Fetch sequentially (friendlier to school networks)
  for (const t of UNIVERSE) {
    try {
      const rows = await fetchStooqDaily(t);
      const m = computeMetrics(t, rows);
      if (m) { results.push(m); ok++; }
      else { bad++; }
    } catch {
      bad++;
    }
  }

  if (!results.length) {
    status(`No usable data. (Ok: ${ok}, Failed/Filtered: ${bad})`);
    outEl.innerHTML = `
      <p class="small">Nothing worked. Most likely your network blocked the data source.</p>
      <p class="small">If you tell me what school device/browser you’re on + the error message, I’ll switch the data method.</p>
    `;
    return;
  }

  // Rank: trendOk first, then score desc
  results.sort((a,b) => (b.trendOk - a.trendOk) || (b.score - a.score));

  const eligible = results.filter(r => r.trendOk);
  const picks = eligible.slice(0, PICKS_N);

  status(`Done. Eligible: ${eligible.length}/${results.length}.`);

  if (!picks.length) {
    outEl.innerHTML = `
      <p class="small">No tickers passed the trend filter (Close > MA20 > MA50).</p>
      <p class="small">That usually means the market is choppy/down. Re-run later.</p>
    `;
    return;
  }

  outEl.innerHTML = `
    <div class="small">
      <span class="pill">Picks</span>
      Score = 0.7·R20 + 0.3·R5, Trend = Close > MA20 > MA50, Min price = $${MIN_PRICE}
    </div>

    ${renderPicksTable(picks)}

    <details style="margin-top:10px">
      <summary class="small">Show top 25 ranking</summary>
      ${renderRankingTable(results.slice(0,25))}
    </details>
  `;
}

function status(msg){ statusEl.textContent = msg; }

async function fetchStooqDaily(ticker) {
  // Stooq uses "aapl.us" for US tickers
  const sym = ticker.toLowerCase() + ".us";
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;

  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("fetch failed");

  const text = await res.text();
  const rows = parseStooqCSV(text);
  rows.sort((a,b) => a.date - b.date);
  return rows;
}

function parseStooqCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 15) throw new Error("too short");
  const header = lines[0].split(",").map(x => x.trim().toLowerCase());
  const di = header.indexOf("date");
  const ci = header.indexOf("close");
  if (di === -1 || ci === -1) throw new Error("bad columns");

  const rows = [];
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(",");
    if (parts.length <= Math.max(di,ci)) continue;
    const d = new Date(parts[di].trim());
    const c = Number(parts[ci].trim());
    if (!Number.isNaN(d.getTime()) && Number.isFinite(c)) rows.push({date:d, close:c});
  }
  return rows;
}

function sma(values, n) {
  if (values.length < n) return null;
  let s = 0;
  for (let i=values.length-n;i<values.length;i++) s += values[i];
  return s/n;
}
function pct(values, lookback) {
  if (values.length <= lookback) return null;
  const now = values[values.length-1];
  const past = values[values.length-1-lookback];
  if (past === 0) return null;
  return now/past - 1;
}

function computeMetrics(ticker, rows) {
  if (rows.length < 70) return null;
  const closes = rows.map(r => r.close);
  const last = closes[closes.length-1];
  if (last < MIN_PRICE) return null;

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const r5 = pct(closes, 5);
  const r20 = pct(closes, 20);
  if (ma20 === null || ma50 === null || r5 === null || r20 === null) return null;

  const trendOk = last > ma20 && ma20 > ma50;
  const score = 0.7*r20 + 0.3*r5;

  return { ticker, last, ma20, ma50, r5, r20, score, trendOk };
}

function fmtPct(x){ return (x*100).toFixed(2) + "%"; }

function renderPicksTable(picks) {
  return `
    <table>
      <thead>
        <tr>
          <th>#</th><th>Ticker</th><th>Last</th><th>R5</th><th>R20</th><th>Score</th><th>Trend</th>
        </tr>
      </thead>
      <tbody>
        ${picks.map((p,i)=>`
          <tr>
            <td><b>${i+1}</b></td>
            <td><b>${p.ticker}</b></td>
            <td>${p.last.toFixed(2)}</td>
            <td>${fmtPct(p.r5)}</td>
            <td>${fmtPct(p.r20)}</td>
            <td><b>${fmtPct(p.score)}</b></td>
            <td>${p.trendOk ? "✅" : "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="small" style="margin-top:10px">
      Trade plan: buy the 4 picks, rebalance weekly. Use limit orders. Stops: 7% initial → 6% trailing after +8% → 4.5% trailing after +15%.
    </p>
  `;
}

function renderRankingTable(list) {
  return `
    <table>
      <thead>
        <tr><th>Rank</th><th>Ticker</th><th>Last</th><th>Score</th><th>Trend</th></tr>
      </thead>
      <tbody>
        ${list.map((p,i)=>`
          <tr>
            <td>${i+1}</td>
            <td>${p.ticker}</td>
            <td>${p.last.toFixed(2)}</td>
            <td>${fmtPct(p.score)}</td>
            <td>${p.trendOk ? "✅" : "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
