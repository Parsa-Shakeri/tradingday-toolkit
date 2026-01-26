// Trading Day Picks — Enhanced
// Adds: NEW flags, diversification cap (correlation), auto-run on load, late-month mode, explanations.
// Reads data from: ./data/latest.json
}
let statusEl, outEl, btnEl;

document.addEventListener("DOMContentLoaded", () => {
  statusEl = document.getElementById("status");
  outEl = document.getElementById("out");
  btnEl = document.getElementById("go");

  if (!btnEl) {
    console.error("Button with id='go' not found.");
    return;
  }

  // Attach click handler (this is what you're missing)
  btnEl.addEventListener("click", () => run(true));

  // Auto-run on page load
  setTimeout(() => run(false), 50);
});

const statusEl = document.getElementById("status");
const outEl = document.getElementById("out");
const btnEl = document.getElementById("go");

btnEl.addEventListener("click", () => run(true));

// --- Hardcoded for competition style (no settings UI) ---
const BUY_N = 4;
const SHOW_N = 10;
const MIN_HISTORY = 220;

// Diversification cap via correlation on last 60 daily returns
const CORR_LOOKBACK = 60;
const CORR_MAX = 0.85; // reject a candidate if too correlated with any existing pick

// Late-month protection window
const LATE_WINDOW_DAYS = 7;

// localStorage keys
const LS_TOP10_KEY = "td_lastTop10";
const LS_BUY4_KEY  = "td_lastBuy4";
const LS_DATE_KEY  = "td_lastDate";

// Auto-run on load
document.addEventListener("DOMContentLoaded", () => {
  // Slight delay ensures the UI has rendered
  setTimeout(() => run(false), 50);
});

async function run(isManualClick) {
  try {
    btnEl.textContent = "Re-run";
    status("Loading data…");
    outEl.innerHTML = "";
    // ...rest of your run code...
  } catch (e) {
    console.error(e);
    status("Error — open Console (Ctrl+Shift+I) to see it.");
  }
}


  const res = await fetch("./data/latest.json", { cache: "no-store" });
  if (!res.ok) return status("Could not load data/latest.json");

  const json = await res.json();
  const tickers = json.tickers || {};

  // ----- Market regime (SPY MA200) -----
  const { riskOn, spyLast, spyMA200 } = computeMarketRegime(tickers);

  // ----- Late-month mode -----
  const { lateMode, daysRemaining } = getLateMonthMode();
  // late mode = protect leaderboard (less chaos)
  // We’ll increase volatility penalty + add small “stickiness” to yesterday’s winners.

  // Read yesterday state (for NEW flag + late-mode stickiness)
  const prev = readPrevState();
  const prevTop10Set = new Set(prev.top10);
  const prevBuy4Set = new Set(prev.buy4);

const rows = tickers[ticker];
if (!rows || rows.length < MIN_HISTORY) continue;

// rows: [d, o, h, l, c, v]
const opens  = rows.map(r => r[1]);
const highs  = rows.map(r => r[2]);
const lows   = rows.map(r => r[3]);
const closes = rows.map(r => r[4]);
const vols   = rows.map(r => r[5]);

const lastClose = last(closes);

const ma20 = sma(closes, 20);
const ma50 = sma(closes, 50);
const ma200 = sma(closes, 200);
if ([ma20, ma50, ma200].some(v => v === null)) continue;

const r20 = ret(closes, 20);
const r60 = ret(closes, 60);
if (r20 === null || r60 === null) continue;

const vol20 = stdev(returns(closes, 21));     // same as before
const rsi14 = rsi(closes, 14);
const atr14p = atrPercent(highs, lows, closes, 14); // ATR% of price
const volSurge = vols.length >= 21 ? (last(vols) / sma(vols, 20)) : null;
const dd60 = maxDrawdown(closes, 60);

// Relative strength vs SPY (60d)
const rs60 = relStrength60(tickers, ticker); // defined below (uses SPY)

const trendStrong = (lastClose > ma20) && (ma20 > ma50) && (ma50 > ma200);
const eligible = (lastClose > ma20) && (riskOn ? true : (trendStrong || isDefensiveETF(ticker)));

// --- Scoring upgrades ---
let volPenalty = riskOn ? 0.30 : 0.55;
if (lateMode) volPenalty += 0.20;

let score =
  (0.45 * r60) +
  (0.25 * r20) +
  (trendStrong ? 0.06 : 0) -
  (volPenalty * vol20);

// Bonus: beating SPY over 60d
if (rs60 !== null) score += 0.20 * rs60;

// Bonus: volume confirmation (cap it so it doesn’t dominate)
if (volSurge !== null) score += Math.min(0.06, 0.02 * (volSurge - 1));

// Penalty: too wild (ATR%)
if (atr14p !== null) score -= Math.max(0, atr14p - 0.06); // punish ATR% above ~6%

// Penalty: totally overheated RSI
if (rsi14 !== null && rsi14 > 80) score -= 0.05;
if (rsi14 !== null && rsi14 < 35) score -= 0.03; // weak bounce risk

// Penalty: ugly recent drawdown
if (dd60 !== null) score -= 0.20 * Math.max(0, dd60 - 0.25); // punish drawdown >25%

// Late-month stickiness stays the same
if (lateMode && prevBuy4Set.has(ticker)) score += 0.02;

results.push({
  ticker, lastClose, r20, r60, vol20, rsi14, atr14p, volSurge, dd60, rs60,
  trendStrong, eligible, score,
  retSeries
});


    // Basic eligibility:
    // - always require lastClose > MA20 (uptrend)
    // - in risk-off, require stronger trend OR be defensive ETF proxy
    const eligible = (lastClose > ma20) && (riskOn ? true : (trendStrong || isDefensiveETF(ticker)));

    // Scoring:
    // - reward 60d + 20d momentum
    // - reward strong trend
    // - penalize volatility (more in risk-off)
    // - in late mode, penalize volatility more + reward stability slightly
    let volPenalty = riskOn ? 0.35 : 0.65;
    if (lateMode) volPenalty += 0.20;

    let score =
      (0.55 * r60) +
      (0.35 * r20) +
      (trendStrong ? 0.06 : 0) -
      (volPenalty * vol20);

    // Late-month “protect rank”: tiny bonus for staying with yesterday’s winners
    if (lateMode && prevBuy4Set.has(ticker)) score += 0.02;

    // Keep return series for correlation-based diversification
    const retSeries = returns(closes, CORR_LOOKBACK + 1); // => CORR_LOOKBACK returns

    results.push({
      ticker,
      lastClose,
      r20,
      r60,
      vol20,
      trendStrong,
      eligible,
      score,
      retSeries
    });
  }

  results.sort((a, b) => (b.eligible - a.eligible) || (b.score - a.score));

  const eligibleList = results.filter(r => r.eligible);

  // ---- Top 10 (for display + NEW flag) ----
  const top10 = eligibleList.slice(0, SHOW_N);

  // ---- Buy 4 with diversification cap (correlation) ----
  const buy4 = pickWithDiversification(eligibleList, BUY_N);

  // Save current state (for tomorrow’s NEW flags)
  writePrevState({
    top10: top10.map(x => x.ticker),
    buy4: buy4.map(x => x.ticker),
  });

  // Status + render
  status(
    `Done. Regime: ${riskOn ? "RISK-ON" : "RISK-OFF"}`
    + (lateMode ? ` | LATE-MONTH (protect) — ${daysRemaining} day(s) left` : "")
    + ` | Eligible: ${eligibleList.length}`
  );

  if (!buy4.length) {
    outEl.innerHTML = `<p class="small">No eligible picks today. Try again tomorrow.</p>`;
    return;
  }

  outEl.innerHTML = render(top10, buy4, {
    riskOn, lateMode, daysRemaining, prevTop10Set, prevBuy4Set, spyLast, spyMA200
  });
}

// -------------------- Render --------------------

function render(top10, buy4, ctx) {
  const buySet = new Set(buy4.map(x => x.ticker));

  const modeText = ctx.riskOn ? "RISK-ON (aggressive)" : "RISK-OFF (defensive)";
  const lateText = ctx.lateMode ? ` | LATE-MONTH MODE (${ctx.daysRemaining} day(s) left)` : "";

  const buyLine = buy4.map(x => x.ticker).join(", ");

  const spyInfo = (Number.isFinite(ctx.spyLast) && Number.isFinite(ctx.spyMA200))
    ? `SPY ${ctx.spyLast.toFixed(2)} vs MA200 ${ctx.spyMA200.toFixed(2)}`
    : `SPY regime check unavailable`;

  return `
    <p class="small">
      <b>Mode:</b> ${modeText}${lateText}<br/>
      <b>Market:</b> ${spyInfo}<br/>
      <b>BUY these ${BUY_N}:</b> ${buyLine}
    </p>

    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Ticker</th>
          <th>Tag</th>
          <th>Last</th>
          <th>R20</th>
          <th>R60</th>
          <th>Vol20</th>
          <th>Trend</th>
          <th>Score</th>
          <th>Why?</th>
        </tr>
      </thead>
      <tbody>
        ${top10.map((x, i) => {
          const isBuy = buySet.has(x.ticker);
          const isNew = !ctx.prevTop10Set.has(x.ticker);
          const tag = isBuy ? "BUY ✅" : (isNew ? "NEW 🟢" : "—");

          const why = explainPick(x, ctx);

          return `
            <tr>
              <td><b>${i + 1}</b></td>
              <td><b>${x.ticker}${isBuy ? " ✅" : ""}</b></td>
              <td>${tag}</td>
              <td>${x.lastClose.toFixed(2)}</td>
              <td>${pct(x.r20)}</td>
              <td>${pct(x.r60)}</td>
              <td>${pct(x.vol20)}</td>
              <td>${x.trendStrong ? "STRONG" : "OK"}</td>
              <td><b>${pct(x.score)}</b></td>
              <td>
                <details>
                  <summary class="small">Why</summary>
                  <div class="small">${why}</div>
                </details>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>

    <p class="small" style="margin-top:10px">
      <b>Diversification cap:</b> picks avoid correlation &gt; ${CORR_MAX.toFixed(2)} (last ${CORR_LOOKBACK} daily returns) so you don’t end up with 4 clones.
      <br/>
      <b>Execution:</b> rebalance weekly (Fri after close). Emergency replace only if a holding breaks hard.
      <br/>
      <b>Stops:</b> −7% initial → 6% trailing after +8% → 4.5% trailing after +15%.
    </p>
  `;
}

function explainPick(x, ctx) {
  const trend = x.trendStrong ? "MA20 > MA50 > MA200 + price above MA20" : "price above MA20";
  const regime = ctx.riskOn ? "RISK-ON (momentum prioritized)" : "RISK-OFF (defensive filter)";
  const late = ctx.lateMode ? "Late-month protection: extra volatility penalty + slight bonus for staying with yesterday’s winners." : "";
  return `
    Selected because:
    <ul>
      <li><b>Momentum:</b> R60=${pct(x.r60)}, R20=${pct(x.r20)}</li>
      <li><b>Trend:</b> ${trend}</li>
      <li><b>Volatility:</b> Vol20=${pct(x.vol20)} (penalized in score)</li>
      <li><b>Regime:</b> ${regime}</li>
      ${late ? `<li><b>Late-month:</b> ${late}</li>` : ""}
    </ul>
  `.trim();
}

// -------------------- Diversification via correlation --------------------

function pickWithDiversification(eligibleList, n) {
  const picks = [];

  for (const cand of eligibleList) {
    if (picks.length >= n) break;

    // Need return series for correlation check
    if (!cand.retSeries || cand.retSeries.length < CORR_LOOKBACK) continue;

    let tooSimilar = false;
    for (const p of picks) {
      const c = corr(cand.retSeries, p.retSeries);
      if (Number.isFinite(c) && c > CORR_MAX) {
        tooSimilar = true;
        break;
      }
    }
    if (!tooSimilar) picks.push(cand);
  }

  // If diversification made it impossible to fill, top up ignoring correlation (rare)
  if (picks.length < n) {
    for (const cand of eligibleList) {
      if (picks.length >= n) break;
      if (!picks.find(p => p.ticker === cand.ticker)) picks.push(cand);
    }
  }

  return picks.slice(0, n);
}

function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 10) return NaN;
  const a2 = a.slice(a.length - n);
  const b2 = b.slice(b.length - n);

  const ma = mean(a2);
  const mb = mean(b2);

  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a2[i] - ma;
    const xb = b2[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da) * Math.sqrt(db);
  return den === 0 ? NaN : (num / den);
}

// -------------------- Regime + Late-month --------------------

function computeMarketRegime(tickers) {
  const spy = tickers["SPY"];
  if (!spy || spy.length < 210) return { riskOn: true, spyLast: NaN, spyMA200: NaN };

  const closes = spy.map(r => r[1]);
  const spyLast = last(closes);
  const spyMA200 = sma(closes, 200);
  const riskOn = spyMA200 !== null && spyLast > spyMA200;

  return { riskOn, spyLast, spyMA200 };
}

function getLateMonthMode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0=Jan
  const day = now.getDate();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysRemaining = daysInMonth - day;

  return {
    lateMode: daysRemaining <= LATE_WINDOW_DAYS,
    daysRemaining
  };
}

// -------------------- Persistence for NEW flags --------------------

function readPrevState() {
  try {
    const date = localStorage.getItem(LS_DATE_KEY) || "";
    const top10 = JSON.parse(localStorage.getItem(LS_TOP10_KEY) || "[]");
    const buy4  = JSON.parse(localStorage.getItem(LS_BUY4_KEY)  || "[]");
    return {
      date,
      top10: Array.isArray(top10) ? top10 : [],
      buy4:  Array.isArray(buy4) ? buy4 : []
    };
  } catch {
    return { date: "", top10: [], buy4: [] };
  }
}

function writePrevState({ top10, buy4 }) {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(LS_DATE_KEY, today);
  localStorage.setItem(LS_TOP10_KEY, JSON.stringify(top10));
  localStorage.setItem(LS_BUY4_KEY, JSON.stringify(buy4));
}

// -------------------- Helpers --------------------

function isDefensiveETF(t) {
  // small whitelist for risk-off
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

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs) {
  const n = xs.length;
  if (!n) return NaN;
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / n;
  return Math.sqrt(v);
}

function pct(x) {
  return (x * 100).toFixed(2) + "%";
}

function status(msg) {
  statusEl.textContent = msg;
}
function rsi(closes, period) {
  if (closes.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gains += ch;
    else losses -= ch;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function atrPercent(highs, lows, closes, period) {
  if (closes.length <= period) return null;
  let sumTR = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    sumTR += tr;
  }
  const atr = sumTR / period;
  const lastClose = last(closes);
  return lastClose ? (atr / lastClose) : null;
}

function maxDrawdown(closes, lookback) {
  if (closes.length < lookback + 1) return null;
  const slice = closes.slice(closes.length - lookback);
  let peak = slice[0];
  let maxDD = 0;
  for (const x of slice) {
    if (x > peak) peak = x;
    const dd = (peak - x) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD; // 0.25 = 25%
}

function relStrength60(tickersObj, tkr) {
  const spy = tickersObj["SPY"];
  const x = tickersObj[tkr];
  if (!spy || !x) return null;
  if (spy.length < 70 || x.length < 70) return null;

  const spyCloses = spy.map(r => r[4]); // close
  const xCloses = x.map(r => r[4]);

  const spyR = ret(spyCloses, 60);
  const xR = ret(xCloses, 60);
  if (spyR === null || xR === null) return null;

  return (xR - spyR); // positive means beating SPY
}
