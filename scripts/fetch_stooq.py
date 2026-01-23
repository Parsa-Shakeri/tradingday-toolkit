import json
import time
import urllib.request
from datetime import datetime, timezone

UNIVERSE = [
  "SPY","QQQ","IWM","DIA",
  "NVDA","MSFT","AAPL","AMZN","META","GOOGL","AVGO","AMD","TSLA",
  "XLK","XLY","XLF","XLE","XLI","XLV",
  "SMH","SOXX","ARKK","COST","LLY","UNH","JPM","V","MA","NFLX"
]

def fetch_csv(ticker):
    sym = ticker.lower() + ".us"
    url = f"https://stooq.com/q/d/l/?s={sym}&i=d"
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")

def parse(csv_text):
    lines = [l for l in csv_text.splitlines() if l.strip()]
    header = lines[0].lower().split(",")
    di = header.index("date")
    ci = header.index("close")

    rows = []
    for line in lines[1:]:
        p = line.split(",")
        rows.append([p[di], float(p[ci])])
    return rows[-200:]

out = {
    "updated_utc": datetime.now(timezone.utc).isoformat(),
    "tickers": {}
}

for t in UNIVERSE:
    try:
        data = parse(fetch_csv(t))
        if len(data) >= 70:
            out["tickers"][t] = data
        time.sleep(0.2)
    except:
        pass

with open("data/latest.json", "w") as f:
    json.dump(out, f)

