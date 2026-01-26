import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MIN_PRICE = 5.0

def force_fetch(ticker: str):
    try:
        series = parse_ohlcv(fetch_csv(ticker))
        return series
    except:
        return None

def fetch_csv(ticker: str) -> str:
    sym = ticker.lower() + ".us"
    url = f"https://stooq.com/q/d/l/?s={sym}&i=d"
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")

def parse_ohlcv(csv_text: str):
    lines = [ln.strip() for ln in csv_text.splitlines() if ln.strip()]
    if len(lines) < 40:
        return None

    header = [h.strip().lower() for h in lines[0].split(",")]
    needed = ["date","open","high","low","close","volume"]
    if any(k not in header for k in needed):
        return None

    idx = {k: header.index(k) for k in needed}

    rows = []
    for ln in lines[1:]:
        p = ln.split(",")
        if len(p) <= max(idx.values()):
            continue
        try:
            d = p[idx["date"]].strip()
            o = float(p[idx["open"]])
            h = float(p[idx["high"]])
            l = float(p[idx["low"]])
            c = float(p[idx["close"]])
            v = float(p[idx["volume"]])
        except:
            continue
        rows.append([d, o, h, l, c, v])

    rows.sort(key=lambda x: x[0])
    if len(rows) < 220:
        return None
    if rows[-1][4] < MIN_PRICE:   # close
        return None
    return rows[-260:]            # ~1 trading year

def load_universe():
    p = Path("data/universe.txt")
    if not p.exists():
        raise RuntimeError("Missing data/universe.txt")
    out = []
    seen = set()
    for line in p.read_text(encoding="utf-8").splitlines():
        t = line.strip().upper()
        if t and not t.startswith("#") and t not in seen:
            seen.add(t)
            out.append(t)
    return out

def main():
    universe = load_universe()

    out = {
        "updated_utc": datetime.now(timezone.utc).isoformat(),
        "source": "stooq",
        "schema": "d,open,high,low,close,volume",
        "min_price": MIN_PRICE,
        "count_requested": len(universe),
        "tickers": {}
    }

    ok = 0
    for t in universe:
        try:
            series = parse_ohlcv(fetch_csv(t))
            if series:
                out["tickers"][t] = series
                ok += 1
            time.sleep(0.12)
        except:
            pass

    out["count_loaded"] = ok
    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/latest.json").write_text(json.dumps(out), encoding="utf-8")

if __name__ == "__main__":
    main()
