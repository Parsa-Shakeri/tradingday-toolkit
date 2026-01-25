const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
document.getElementById("go").addEventListener("click", run);

const BUY_N = 4;      // what you actually buy
const SHOW_N = 10;    // show top 10
const MIN_HISTORY = 220;

async function run() {
  status("Loading data…");
  outEl.innerHTML = "";

  const res = await fetch("./data/latest.json", { cache: "no-store" });
  if (!res.ok) return status("Could not load data/latest.json");

  const json = await res.json();
  const tickers = json.tickers;

  // --- market regime using SPY (risk-on vs risk-off) ---
  const spy = tickers["SPY"];
  let riskOn = true;
  if (spy && spy.length >= 210) {
    const spyCloses = spy.map(r => r[1]);
    const spyLast = last(spyCloses);
    const spyMA200 = sma(spyCloses, 200);
    riskOn = spyMA200 !== null && spyLast > spyMA200;
  }

  const results = [];
  for (const ticker in tickers) {
    const rows = tickers[ticker];
    if (rows.length < MIN_HISTORY) continue;

    const closes = rows.map(r => r[1]);

    const lastClose = last(closes);
    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);

    if ([ma20, ma50, ma200].some(v => v === null)) continue;

    // Trend quality
    const trendStrong = (lastClose > ma20) && (ma20 > ma50) && (ma50 > ma200);

    // Returns
    const r20 = ret(closes, 20);
    const r60 = ret(closes, 60);
    if (r20 === null || r60 === null) continue;

    // Volatility (20-day)
    const vol20 = stdev(returns(closes, 21)); // ~20 returns
    if (!Number.isFinite(vol20) || vol20 <= 0) continue;

    // Score:
    // - reward 20d + 60d momentum
    // - reward strong trend alignment
    // - penalize excessive volatility
    // - in risk-off regime, favor lower vol more strongly
    const volPenalty = riskOn ? 0.35 : 0.65;

    const score =
      (0.55 * r60) +
      (0.35 * r20) +
      (trendStrong ? 0.06 : 0) -
      (volPenalty * vol20);

    // Eligibility:
    // - Always require lastClose > MA20 (basic uptrend)
    // - In risk-off, require trendStrong OR (ticker is broad ETF-like) (simple proxy)
    const eligible = (lastClose > ma20) && (riskOn ? true : (trendStrong || isDefensiveETF(ticker)));

    results.push({
      ticker, lastClose, r20, r60, vol20, score, eligible, trendStrong
    });
  }

  results.sort((a, b) => (b.eligible - a.eligible) || (b.score - a.score));

  const eligible = results.filter(r => r.eligible);
  const picks = eligible.slice(0, BUY_N);
  const top10 = eligible.slice(0, SHOW_N);

  status(`Done. Regime: ${riskOn ? "RISK-ON" : "RISK-OFF"} | Eligible: ${eligible.length}`);

  if (!picks.length) {
    outEl.innerHTML = `<p class="small">No eligible picks today. Try again tomorrow.</p>`;
    return;
  }

  outEl.innerHTML = render(top10, picks, riskOn);
}

function render(top10, picks, riskOn) {
  const pickSet = new Set(picks.map(p => p.ticker));
  return `
    <p class="small">
      <b>Mode:</b> ${riskOn ? "RISK-ON (aggressive)" : "RISK-OFF (defensive)"}<br/>
      <b>BUY these 4:</b> ${picks.map(p => p.ticker).join(", ")}
    </p>

    <table>
      <thead>
        <tr>
          <th>Rank</th><th>Ticker</th><th>Last</th><th>R20</th><th>R60</th><th>Vol20</th><th>Trend</th><th>Score</th>
        </tr>
      </thead>
      <tbody>
        ${top10.map((x, i) => `
          <tr>
            <td><b>${i + 1}</b></td>
            <td><b>${x.ticker}${pickSet.has(x.ticker) ? " ✅" : ""}</b></td>
            <td>${x.lastClose.toFixed(2)}</td>
            <td>${pct(x.r20)}</td>
            <td>${pct(x.r60)}</td>
            <td>${pct(x.vol20)}</td>
            <td>${x.trendStrong ? "STRONG" : "OK"}</td>
            <td><b>${pct(x.score)}</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <p class="small" style="margin-top:10px">
      Suggested execution: rebalance weekly (Fri after close). Emergency replace only if a holding breaks hard.
      Stops: −7% initial → 6% trailing after +8% → 4.5% trailing after +15%.
    </p>
  `;
}

function isDefensiveETF(t) {
  // small whitelist for risk-off (you can expand)
  return ["SPY","QQQ","IWM","DIA","XLV","XLP","TLT","IEF"].includes(t);
}

function last(arr) { return arr[arr.length - 1]; }

function sma(arr, n) {
  if (arr.length < n) return null;
  let s = 0;
  for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}

function ret(arr, n) {
  if (arr.length <= n) return null;
  const now = arr[arr.length - 1];
  const past = arr[arr.length - 1 - n];
  if (past === 0) return null;
  return now / past - 1;
}

function returns(closes, window) {
  // last (window-1) daily returns
  const out = [];
  const start = Math.max(1, closes.length - window);
  for (let i = start; i < closes.length; i++) {
    out.push(closes[i] / closes[i - 1] - 1);
  }
  return out;
}

function stdev(xs) {
  const n = xs.length;
  if (!n) return NaN;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const varr = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / n;
  return Math.sqrt(varr);
}

function pct(x) {
  return (x * 100).toFixed(2) + "%";
}

function status(msg) {
  statusEl.textContent = msg;
}
