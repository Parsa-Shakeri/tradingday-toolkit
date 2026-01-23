// Trading Day Auto Toolkit
// Fetch daily historical CSV from Stooq (no API key): https://stooq.com/q/d/l/?s=aapl.us&i=d
// Then compute: MA20, MA50, R5, R20, Score (0.7*R20 + 0.3*R5)
// Trend filter: Close > MA20 > MA50
// Output: top N picks + equal-dollar allocation based on target exposure (cash * targetLeverage)
// Notes: EOD data (good for weekly ranking). Not real-time bid/ask.

const statusDiv = document.getElementById("status");
const resultsDiv = document.getElementById("results");

document.getElementById("useStarterBtn").addEventListener("click", () => {
  document.getElementById("tickers").value =
    "SPY QQQ IWM NVDA MSFT META AMZN AAPL AVGO AMD SMH SOXX XLK XLY";
});

document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("tickers").value = "";
  statusDiv.textContent = "";
  resultsDiv.innerHTML = `<p class="small">Enter tickers, then click <b>Fetch & Analyze</b>.</p>`;
});

document.getElementById("fetchAnalyzeBtn").addEventListener("click", async () => {
  const cash = num("cash");
  const maxLev = num("maxLeverage");
  const targetLev = num("targetLeverage");
  const numPicks = Math.max(1, Math.floor(num("numPicks")));
  const minPrice = num("minPrice");
  const lookbackDays = Math.max(80, Math.floor(num("lookbackDays")));

  const stopLoss = num("stopLoss");
  const trail1 = num("trail1");
  const trail2 = num("trail2");

  if (!Number.isFinite(cash) || cash <= 0) return setStatus("Cash must be > 0.");
  if (targetLev > maxLev) return setStatus("Target Exposure cannot exceed Max Buying Power.");

  const tickers = parseTickers(document.getElementById("tickers").value);
  if (!tickers.length) return setStatus("Enter at least 1 ticker.");

  setStatus(`Fetching data for ${tickers.length} ticker(s)…`);

  const metrics = [];
  let ok = 0, bad = 0;

  // Fetch sequentially to be polite / avoid school network throttles
  for (const t of tickers) {
    try {
      const rows = await fetchStooqDaily(t);
      const m = computeMetrics(t, rows, minPrice, lookbackDays);
      if (m) {
        metrics.push(m);
        ok++;
      } else {
        bad++;
      }
    } catch (e) {
      bad++;
    }
  }

  if (!metrics.length) {
    setStatus(`No usable data. Loaded: ${ok}, failed/filtered: ${bad}.`);
    resultsDiv.innerHTML =
      `<p class="small">Nothing passed filters. Try bigger tickers (SPY, QQQ, AAPL, MSFT) and ensure your school network allows Stooq.</p>`;
    return;
  }

  // Rank: trendOk first, then score desc
  metrics.sort((a, b) => {
    if (a.trendOk !== b.trendOk) return a.trendOk ? -1 : 1;
    return b.score - a.score;
  });

  const eligible = metrics.filter(x => x.trendOk);
  const picks = eligible.slice(0, numPicks);

  const targetExposure = cash * targetLev;
  const perPos = picks.length ? targetExposure / picks.length : 0;

  setStatus(`Done. Usable: ${ok}, failed/filtered: ${bad}. Eligible (trend ok): ${eligible.length}.`);

  const stopText =
    `Stops: initial stop = ${stopLoss}% below entry. After +8% gain use ${trail1}% trailing stop. After +15% gain use ${trail2}% trailing stop.`;

  resultsDiv.innerHTML = `
    <div class="row" style="align-items:center;justify-content:space-between;">
      <div>
        <span class="badge">Target Exposure</span> <b>${fmtMoney(targetExposure)}</b>
        <span class="badge" style="margin-left:10px;">Per Position</span> <b>${fmtMoney(perPos)}</b>
      </div>
      <div class="small">${stopText}</div>
    </div>

    ${picks.length ? renderPicksTable(picks, perPos) : `<p class="small">No tickers passed trend filter (Close > MA20 > MA50).</p>`}
    ${renderFullRanking(metrics)}
    <p class="small"><b>Weekly routine:</b> run this Friday after close → hold top N trend-passers → rebalance weekly unless stopped out.</p>
  `;
});

function num(id) {
  return Number(document.getElementById(id).value);
}

function setStatus(msg) {
  statusDiv.textContent = msg;
}

function parseTickers(text) {
  return Array.from(
    new Set(
      text
        .toUpperCase()
        .replace(/[\n,]+/g, " ")
        .split(/\s+/)
        .map(s => s.trim())
        .filter(Boolean)
    )
  );
}

async function fetchStooqDaily(ticker) {
  // Stooq format for US is "aapl.us"
  const sym = ticker.toLowerCase() + ".us";
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;

  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Fetch failed");
  const text = await res.text();

  const rows = parseStooqCSV(text);
  // sort ascending
  rows.sort((a, b) => a.date - b.date);
  return rows;
}

function parseStooqCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 10) throw new Error("Not enough rows");

  const header = lines[0].split(",").map(x => x.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const closeIdx = header.indexOf("close");
  if (dateIdx === -1 || closeIdx === -1) throw new Error("Missing columns");

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length <= Math.max(dateIdx, closeIdx)) continue;
    const d = new Date(parts[dateIdx].trim());
    const c = Number(parts[closeIdx].trim());
    if (!Number.isNaN(d.getTime()) && Number.isFinite(c)) rows.push({ date: d, close: c });
  }
  return rows;
}

function sma(values, window) {
  if (values.length < window) return null;
  let sum = 0;
  for (let i = values.length - window; i < values.length; i++) sum += values[i];
  return sum / window;
}

function pctChange(values, lookback) {
  if (values.length <= lookback) return null;
  const now = values[values.length - 1];
  const past = values[values.length - 1 - lookback];
  if (past === 0) return null;
  return now / past - 1;
}

function computeMetrics(ticker, rows, minPrice, lookbackDays) {
  // Use only the last lookbackDays rows (still needs >= 60)
  if (rows.length < 70) return null;
  const slice = rows.slice(Math.max(0, rows.length - lookbackDays));
  const closes = slice.map(r => r.close);
  if (closes.length < 60) return null;

  const last = closes[closes.length - 1];
  if (last < minPrice) return null;

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const r5 = pctChange(closes, 5);
  const r20 = pctChange(closes, 20);
  if (ma20 === null || ma50 === null || r5 === null || r20 === null) return null;

  const trendOk = last > ma20 && ma20 > ma50;
  const score = 0.7 * r20 + 0.3 * r5;

  return { ticker, last, ma20, ma50, r5, r20, score, trendOk };
}

function fmtPct(x) {
  return (x * 100).toFixed(2) + "%";
}

function fmtMoney(x) {
  return "$" + Math.round(x).toLocaleString();
}

function renderPicksTable(picks, perPos) {
  return `
    <table>
      <thead>
        <tr>
          <th>Pick</th>
          <th>Last</th>
          <th>MA20</th>
          <th>MA50</th>
          <th>R5</th>
          <th>R20</th>
          <th>Score</th>
          <th>Suggested $</th>
        </tr>
      </thead>
      <tbody>
        ${picks.map((p, i) => `
          <tr>
            <td><b>${i + 1}. ${p.ticker}</b></td>
            <td>${p.last.toFixed(2)}</td>
            <td>${p.ma20.toFixed(2)}</td>
            <td>${p.ma50.toFixed(2)}</td>
            <td>${fmtPct(p.r5)}</td>
            <td>${fmtPct(p.r20)}</td>
            <td>${fmtPct(p.score)}</td>
            <td><b>${fmtMoney(perPos)}</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderFullRanking(all) {
  const top = all.slice(0, 60);
  return `
    <details>
      <summary class="small">Show full ranking (top 60)</summary>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Trend</th>
            <th>Last</th>
            <th>R5</th>
            <th>R20</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${top.map(p => `
            <tr>
              <td>${p.ticker}</td>
              <td>${p.trendOk ? "✅" : "—"}</td>
              <td>${p.last.toFixed(2)}</td>
              <td>${fmtPct(p.r5)}</td>
              <td>${fmtPct(p.r20)}</td>
              <td>${fmtPct(p.score)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <p class="small">Trend = Close &gt; MA20 &gt; MA50. Ranked by Score = 0.7·R20 + 0.3·R5.</p>
    </details>
  `;
}
