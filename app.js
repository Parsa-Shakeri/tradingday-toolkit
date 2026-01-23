// Trading Day Picks — LOCAL DATA VERSION
// Reads data from data/latest.json (no blocked internet calls)

const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
document.getElementById("go").addEventListener("click", run);

const MIN_PRICE = 5;
const PICKS_N = 4;

async function run() {
  status("Loading data…");
  outEl.innerHTML = "";

  const res = await fetch("./data/latest.json", { cache: "no-store" });
  if (!res.ok) {
    status("Could not load local data.");
    return;
  }

  const json = await res.json();
  const tickers = json.tickers;

  const results = [];

  for (const ticker in tickers) {
    const rows = tickers[ticker];
    if (rows.length < 70) continue;

    const closes = rows.map(r => r[1]);
    const last = closes[closes.length - 1];
    if (last < MIN_PRICE) continue;

    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const r5 = pct(closes, 5);
    const r20 = pct(closes, 20);

    if (!ma20 || !ma50 || r5 === null || r20 === null) continue;

    const trendOk = last > ma20 && ma20 > ma50;
    const score = 0.7 * r20 + 0.3 * r5;

    results.push({ ticker, last, r5, r20, score, trendOk });
  }

  results.sort((a, b) => (b.trendOk - a.trendOk) || (b.score - a.score));
  const picks = results.filter(r => r.trendOk).slice(0, PICKS_N);

  if (!picks.length) {
    status("No picks passed trend filter.");
    return;
  }

  status("Done.");
  outEl.innerHTML = renderTable(picks);
}

function sma(arr, n) {
  if (arr.length < n) return null;
  let s = 0;
  for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}

function pct(arr, n) {
  if (arr.length <= n) return null;
  return arr[arr.length - 1] / arr[arr.length - 1 - n] - 1;
}

function status(msg) {
  statusEl.textContent = msg;
}

function renderTable(picks) {
  return `
    <table>
      <thead>
        <tr>
          <th>#</th><th>Ticker</th><th>Last</th><th>R5</th><th>R20</th><th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${picks.map((p, i) => `
          <tr>
            <td><b>${i + 1}</b></td>
            <td><b>${p.ticker}</b></td>
            <td>${p.last.toFixed(2)}</td>
            <td>${(p.r5 * 100).toFixed(2)}%</td>
            <td>${(p.r20 * 100).toFixed(2)}%</td>
            <td><b>${(p.score * 100).toFixed(2)}%</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="small">
      Buy the top 4. Re-run weekly. Use limit orders.
      Stops: −7% initial → 6% trailing after +8% → 4.5% trailing after +15%.
    </p>
  `;
}
