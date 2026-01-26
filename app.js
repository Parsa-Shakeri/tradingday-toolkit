// Trading Day Picks — Clean + Advanced (OHLCV)
// Metrics: RS vs SPY (60d), Volume Surge, ATR%
// Also: NEW flags, diversification cap (correlation), auto-run on load, late-month mode, explanations.
// Data: ./data/latest.json rows = [date, open, high, low, close, volume]

let statusEl, outEl, btnEl;

const BUY_N = 4;
const SHOW_N = 10;
const MIN_HISTORY = 220;

const CORR_LOOKBACK = 60;
const CORR_MAX = 0.85;

const LATE_WINDOW_DAYS = 7;

const LS_TOP10_KEY = "td_lastTop10";
const LS_BUY4_KEY  = "td_lastBuy4";
const LS_DATE_KEY  = "td_lastDate";

document.addEventListener("DOMContentLoaded", () => {
  statusEl = document.getElementById("status");
  outEl = document.getElementById("out");
  btnEl = document.getElementById("go");

  if (!btnEl || !statusEl || !outEl) return;

  btnEl.addEventListener("click", () => run(true));
  setTimeout(() => run(false), 50); // auto-run on load
});

async function run(isManualClick) {
  try {
    btnEl.textContent = "Re-run";
    status("Loading data…");
    outEl.innerHTML = "";

    const res = await fetch("./data/latest.json", { cache: "no-store" });
    if (!res.ok) return status("Could not load data/latest.json");

    const json = await res.json();
    const tickers = json.tickers || {};

    const { riskOn, spyLast, spyMA200 } = computeMarketRegime(tickers);
    const { lateMode, daysRemaining } = getLateMonthMode();

    const prev = readPrevState();
    const prevTop10Set = new Set(prev.top10);
    const prevBuy4Set = new Set(prev.buy4);

    const results = [];

    for (const ticker in tickers) {
      const rows = tickers[ticker];
      if (!rows || rows.length < MIN_HISTORY) continue;

      // OHLCV schema: [d,o,h,l,c,v]
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

      const vol20 = stdev(returns(closes, 21));
      if (!Number.isFinite(vol20) || vol20 <= 0) continue;

      // 3 key extra metrics
      const atr14p = atrPercent(highs, lows, closes, 14); // ATR% of price
      const volSurge = (vols.length >= 21 && sma(vols, 20) !== null) ? (last(vols) / sma(vols, 20)) : null;
      const rs60 = relStrength60(tickers, ticker); // vs SPY

      const trendStrong = (lastClose > ma20) && (ma20 > ma50) && (ma50 > ma200);

      const eligible =
        (lastClose > ma20) &&
        (riskOn ? true : (trendStrong || isDefensiveETF(ticker)));

      // Base score (momentum + trend - volatility)
      let volPenalty = riskOn ? 0.30 : 0.55;
      if (lateMode) volPenalty += 0.20;

      let score =
        (0.45 * r60) +
        (0.25 * r20) +
        (trendStrong ? 0.06 : 0) -
        (volPenalty * vol20);

      // Add the 3 metrics
      if (rs60 !== null) score += 0.20 * rs60;
     
      if (volSurge !== null && volSurge > 1) {
      score += Math.min(0.06, 0.02 * (volSurge - 1));
      }

      if (atr14p !== null) score -= Math.max(0, atr14p - 0.06); // penalize ATR% above ~6%

      // Late-month “protect rank”: small bonus to stay with yesterday’s winners
      if (lateMode && prevBuy4Set.has(ticker)) score += 0.02;

      // For diversification
      const retSeries = returns(closes, CORR_LOOKBACK + 1);

      results.push({
        ticker,
        lastClose,
        r20,
        r60,
        vol20,
        atr14p,
        volSurge,
        rs60,
        trendStrong,
        eligible,
        score,
        retSeries
      });
    }

    results.sort((a, b) => (b.eligible - a.eligible) || (b.score - a.score));
    const eligibleList = results.filter(r => r.eligible);

    const top10 = eligibleList.slice(0, SHOW_N);
    const buy4 = pickWithDiversification(eligibleList, BUY_N);

    writePrevState({
      top10: top10.map(x => x.ticker),
      buy4: buy4.map(x => x.ticker),
    });

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
      riskOn, lateMode, daysRemaining,
      prevTop10Set, prevBuy4Set,
      spyLast, spyMA200
    });

  } catch (e) {
    status("JS error. Your app.js is not running correctly.");
  }
}

// -------------------- Render --------------------

function render(top10, buy4, ctx) {
  const buySet = new Set(buy4.map(x => x.ticker));
  const modeText = ctx.riskOn ? "RISK-ON (aggressive)" : "RISK-OFF (defensive)";
  const lateText = ctx.lateMode ? ` | LATE-MONTH MODE (${ctx.daysRemaining} day(s) left)` : "";

  const spyInfo = (Number.isFinite(ctx.spyLast) && Number.isFinite(ctx.spyMA200))
    ? `SPY ${ctx.spyLast.toFixed(2)} vs MA200 ${ctx.spyMA200.toFixed(2)}`
    : `SPY regime check unavailable`;

  return `
    <p class="small">
      <b>Mode:</b> ${modeText}${lateText}<br/>
      <b>Market:</b> ${spyInfo}<br/>
      <b>BUY:</b> ${buy4.map(p => p.ticker).join(", ")}
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
          <th>ATR%</th>
          <th>VolSurge</th>
          <th>RS vs SPY</th>
          <th>Score</th>
          <th>Why?</th>
        </tr>
      </thead>
      <tbody>
        ${top10.map((x, i) => {
          const isBuy = buySet.has(x.ticker);
          const isNew = !ctx.prevTop10Set.has(x.ticker);
          const tag = isBuy ? "BUY ✅" : (isNew ? "NEW 🟢" : "—");

          return `
            <tr>
              <td><b>${i + 1}</b></td>
              <td><b>${x.ticker}${isBuy ? " ✅" : ""}</b></td>
              <td>${tag}</td>
              <td>${x.lastClose.toFixed(2)}</td>
              <td>${pct(x.r20)}</td>
              <td>${pct(x.r60)}</td>
              <td>${x.atr14p === null ? "—" : pct(x.atr14p)}</td>
              <td>${x.volSurge === null ? "—" : x.volSurge.toFixed(2) + "×"}</td>
              <td>${x.rs60 === null ? "—" : pct(x.rs60)}</td>
              <td><b>${pct(x.score)}</b></td>
              <td>
                <details>
                  <summary class="small">Why</summary>
                  <div class="small">${explainPick(x, ctx)}</div>
                </details>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>

    <p class="small" style="margin-top:10px">
      <b>Diversification cap:</b> rejects candidates with correlation &gt; ${CORR_MAX.toFixed(2)} (last ${CORR_LOOKBACK} daily returns) vs already-picked names.
    </p>
  `;
}

function explainPick(x, ctx) {
  const trend = x.trendStrong ? "MA20 > MA50 > MA200 and price above MA20" : "price above MA20";
  const regime = ctx.riskOn ? "RISK-ON (momentum prioritized)" : "RISK-OFF (defensive filter)";
  const late = ctx.lateMode ? "Late-month: higher vol penalty + slight bonus for prior winners." : "";
  return `
    <ul>
      <li><b>Momentum:</b> R60=${pct(x.r60)}, R20=${pct(x.r20)}</li>
      <li><b>Trend:</b> ${trend}</li>
      <li><b>ATR%:</b> ${x.atr14p === null ? "—" : pct(x.atr14p)} (lower is smoother)</li>
      <li><b>VolSurge:</b> ${x.volSurge === null ? "—" : x.volSurge.toFixed(2) + "×"} (breakout confirmation)</li>
      <li><b>RS vs SPY (60d):</b> ${x.rs60 === null ? "—" : pct(x.rs60)} (beating market)</li>
      <li><b>Regime:</b> ${regime}</li>
      ${late ? `<li><b>Late-month:</b> ${late}</li>` : ""}
    </ul>
  `.trim();
}

// -------------------- Diversification --------------------

function pickWithDiversification(eligibleList, n) {
  const picks = [];
  for (const cand of eligibleList) {
    if (picks.length >= n) break;
    if (!cand.retSeries || cand.retSeries.length < CORR_LOOKBACK) continue;

    let tooSimilar = false;
    for (const p of picks) {
      const c = corr(cand.retSeries, p.retSeries);
      if (Number.isFinite(c) && c > CORR_MAX) { tooSimilar = true; break; }
    }
    if (!tooSimilar) picks.push(cand);
  }

  // Top up if needed (rare)
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
  const ma = mean(a2), mb = mean(b2);
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
  const spyCloses = spy.map(r => r[4]); // close (OHLCV)
  const spyLast = last(spyCloses);
  const spyMA200 = sma(spyCloses, 200);
  const riskOn = spyMA200 !== null && spyLast > spyMA200;
  return { riskOn, spyLast, spyMA200 };
}

function getLateMonthMode() {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();
  return { lateMode: daysRemaining <= LATE_WINDOW_DAYS, daysRemaining };
}

// -------------------- Persistence --------------------

function readPrevState() {
  try {
    const top10 = JSON.parse(localStorage.getItem(LS_TOP10_KEY) || "[]");
    const buy4  = JSON.parse(localStorage.getItem(LS_BUY4_KEY)  || "[]");
    return {
      top10: Array.isArray(top10) ? top10 : [],
      buy4:  Array.isArray(buy4) ? buy4 : []
    };
  } catch {
    return { top10: [], buy4: [] };
  }
}

function writePrevState({ top10, buy4 }) {
  localStorage.setItem(LS_DATE_KEY, new Date().toISOString().slice(0, 10));
  localStorage.setItem(LS_TOP10_KEY, JSON.stringify(top10));
  localStorage.setItem(LS_BUY4_KEY, JSON.stringify(buy4));
}

// -------------------- Metrics helpers --------------------

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

function relStrength60(tickersObj, tkr) {
  const spy = tickersObj["SPY"];
  const x = tickersObj[tkr];
  if (!spy || !x) return null;
  if (spy.length < 70 || x.length < 70) return null;

  const spyCloses = spy.map(r => r[4]);
  const xCloses = x.map(r => r[4]);

  const spyR = ret(spyCloses, 60);
  const xR = ret(xCloses, 60);
  if (spyR === null || xR === null) return null;

  return (xR - spyR);
}

// -------------------- Generic helpers --------------------

function isDefensiveETF(t) {
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
  if (statusEl) statusEl.textContent = msg;
}
