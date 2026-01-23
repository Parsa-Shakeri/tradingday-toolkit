// Trading Day Toolkit (static)
// - Upload CSVs (Date + Close/Adj Close) for multiple tickers
// - Compute MA20, MA50, R5, R20, Score
// - Trend filter: Close > MA20 > MA50
// - Picks: top N by Score
// - Allocation: target leverage * cash, split equally among picks (simple + robust)

const fileInput = document.getElementById("fileInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");
const uploadStatus = document.getElementById("uploadStatus");
const resultsDiv = document.getElementById("results");

let datasets = []; // { ticker, rows: [{date, close}] }

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) throw new Error("CSV too short");

  const header = lines[0].split(",").map(s => s.trim());
  const dateIdx = header.findIndex(h => h.toLowerCase() === "date");
  let closeIdx = header.findIndex(h => h.toLowerCase() === "close");
  if (closeIdx === -1) closeIdx = header.findIndex(h => h.toLowerCase() === "adj close");
  if (dateIdx === -1 || closeIdx === -1) {
    throw new Error("CSV must include Date and Close (or Adj Close) columns.");
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < Math.max(dateIdx, closeIdx) + 1) continue;

    const dateStr = parts[dateIdx].trim();
    const closeStr = parts[closeIdx].trim();
    const close = Number(closeStr);
    if (!dateStr || !Number.isFinite(close)) continue;

    // Parse date; keep as ISO-ish ordering
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) continue;

    rows.push({ date: d, close });
  }

  // Many downloads are newest->oldest; sort ascending by date
  rows.sort((a, b) => a.date - b.date);
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

function formatPct(x) {
  if (x === null || x === undefined) return "—";
  return (x * 100).toFixed(2) + "%";
}

function formatMoney(x) {
  return "$" + Math.round(x).toLocaleString();
}

function inferTickerFromFilename(name) {
  // Common: "AAPL.csv" or "AAPL (1).csv"
  const base = name.replace(/\.[^/.]+$/, "");
  const ticker = base.split(" ")[0].replace(/[^A-Za-z0-9.\-]/g, "");
  return ticker.toUpperCase() || "UNKNOWN";
}

fileInput.addEventListener("change", async (e) => {
  datasets = [];
  uploadStatus.textContent = "";

  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  let ok = 0, bad = 0;
  for (const f of files) {
    try {
      const text = await f.text();
      const rows = parseCSV(text);
      const ticker = inferTickerFromFilename(f.name);
      datasets.push({ ticker, rows });
      ok++;
    } catch (err) {
      bad++;
      console.warn("Failed to parse", f.name, err);
    }
  }

  uploadStatus.textContent = `Loaded ${ok} file(s). ${bad ? `Failed: ${bad}.` : ""}`;
});

clearBtn.addEventListener("click", () => {
  datasets = [];
  fileInput.value = "";
  uploadStatus.textContent = "";
  resultsDiv.innerHTML = `<p class="small">Upload CSVs and click <b>Analyze</b>.</p>`;
});

analyzeBtn.addEventListener("click", () => {
  const cash = Number(document.getElementById("cash").value);
  const maxLeverage = Number(document.getElementById("maxLeverage").value);
  const targetLeverage = Number(document.getElementById("targetLeverage").value);
  const numPicks = Number(document.getElementById("numPicks").value);
  const minPrice = Number(document.getElementById("minPrice").value);

  const stopLoss = Number(document.getElementById("stopLoss").value);
  const trail1 = Number(document.getElementById("trail1").value);
  const trail2 = Number(document.getElementById("trail2").value);

  if (!datasets.length) {
    resultsDiv.innerHTML = `<p class="small">No CSVs loaded yet.</p>`;
    return;
  }
  if (!Number.isFinite(cash) || cash <= 0) {
    resultsDiv.innerHTML = `<p class="small">Cash must be a positive number.</p>`;
    return;
  }
  if (targetLeverage > maxLeverage) {
    resultsDiv.innerHTML = `<p class="small">Target Exposure cannot exceed Max Buying Power Multiplier.</p>`;
    return;
  }

  // Compute metrics per ticker
  const rowsOut = [];
  for (const ds of datasets) {
    const closes = ds.rows.map(r => r.close);
    if (closes.length < 60) continue; // need enough history for MA50 + lookbacks

    const lastClose = closes[closes.length - 1];
    if (lastClose < minPrice) continue;

    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const r5 = pctChange(closes, 5);
    const r20 = pctChange(closes, 20);

    if (ma20 === null || ma50 === null || r5 === null || r20 === null) continue;

    const trendOk = lastClose > ma20 && ma20 > ma50;
    const score = 0.7 * r20 + 0.3 * r5;

    rowsOut.push({
      ticker: ds.ticker,
      lastClose,
      ma20,
      ma50,
      r5,
      r20,
      score,
      trendOk
    });
  }

  if (!rowsOut.length) {
    resultsDiv.innerHTML = `<p class="small">No usable tickers found. Make sure your CSVs have enough history and include Date + Close columns.</p>`;
    return;
  }

  // Rank: trendOk first, then score desc
  rowsOut.sort((a, b) => {
    if (a.trendOk !== b.trendOk) return a.trendOk ? -1 : 1;
    return b.score - a.score;
  });

  const eligible = rowsOut.filter(r => r.trendOk);
  const picks = eligible.slice(0, Math.max(1, numPicks));

  const targetExposure = cash * targetLeverage;
  const perPosition = picks.length ? targetExposure / picks.length : 0;

  const stopText =
    `Stops: initial stop = ${stopLoss}% below entry. After +8% gain use ${trail1}% trailing stop. After +15% gain use ${trail2}% trailing stop.`;

  // Build output HTML
  const picksHtml = `
    <div class="row" style="align-items:center;justify-content:space-between;">
      <div>
        <span class="badge">Target Exposure</span> <b>${formatMoney(targetExposure)}</b>
        <span class="badge" style="margin-left:10px;">Per Position</span> <b>${formatMoney(perPosition)}</b>
      </div>
      <div class="small">${stopText}</div>
    </div>
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
        ${picks.map((r, i) => `
          <tr>
            <td><b>${i + 1}. ${r.ticker}</b></td>
            <td>${r.lastClose.toFixed(2)}</td>
            <td>${r.ma20.toFixed(2)}</td>
            <td>${r.ma50.toFixed(2)}</td>
            <td>${formatPct(r.r5)}</td>
            <td>${formatPct(r.r20)}</td>
            <td>${formatPct(r.score)}</td>
            <td><b>${formatMoney(perPosition)}</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const fullRankHtml = `
    <details>
      <summary class="small">Show full ranking</summary>
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
          ${rowsOut.slice(0, 60).map(r => `
            <tr>
              <td>${r.ticker}</td>
              <td>${r.trendOk ? "✅" : "—"}</td>
              <td>${r.lastClose.toFixed(2)}</td>
              <td>${formatPct(r.r5)}</td>
              <td>${formatPct(r.r20)}</td>
              <td>${formatPct(r.score)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <p class="small">Showing top 60. Trend = Close &gt; MA20 &gt; MA50.</p>
    </details>
  `;

  const warnings = [];
  if (eligible.length < numPicks) warnings.push(`Only ${eligible.length} tickers passed the trend filter. Upload more tickers/ETFs.`);
  if (targetLeverage > 1.8) warnings.push(`High exposure (${targetLeverage}×) can blow up quickly. Consider 1.6× unless you’re behind mid-month.`);

  resultsDiv.innerHTML = `
    ${warnings.length ? `<div class="status">⚠️ ${warnings.join(" ")}</div>` : ""}
    ${eligible.length ? picksHtml : `<p class="small">No tickers passed the trend filter (Close > MA20 > MA50).</p>`}
    ${fullRankHtml}
  `;
});

