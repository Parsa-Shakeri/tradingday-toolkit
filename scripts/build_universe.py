import re
from pathlib import Path
from urllib.request import urlopen

NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt"
OTHER_LISTED  = "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"

MAX_TICKERS = 1200  # <-- Aggressive 1200

# Aggressive filters: keep symbols that are likely "real tradable" common stocks/ETFs
# We'll still rely on your price>=5 filter later when fetching.
BAD_SUBSTR = ("^", "/", " ", "$")
BAD_SUFFIXES = ("W", "WS", "U", "R", "P")  # warrants/units/rights/preferred-like patterns (imperfect)

def download(url: str) -> str:
    with urlopen(url, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")

def parse_pipe_file(text: str, symbol_col: str):
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    header = lines[0].split("|")
    si = header.index(symbol_col)

    syms = []
    for ln in lines[1:]:
        if ln.startswith("File Creation Time") or ln.startswith("Total Records"):
            continue
        parts = ln.split("|")
        if len(parts) <= si:
            continue
        sym = parts[si].strip().upper()
        if not sym:
            continue
        # drop obvious bads
        if any(x in sym for x in BAD_SUBSTR):
            continue
        if re.search(r"[^A-Z0-9.\-]", sym):
            continue
        syms.append(sym)
    return syms

def normalize_for_stooq(sym: str) -> str:
    # Stooq typically uses dash for share classes (BRK-B) rather than dot (BRK.B)
    return sym.replace(".", "-")

def is_reasonable(sym: str) -> bool:
    # Aggressive but not insane:
    # - allow 1–5 char symbols + class (BRK-B etc.)
    # - filter out many unit/warrant formats (not perfect, but helps)
    base = sym.split("-")[0]
    if len(base) == 0 or len(base) > 5:
        return False
    # Filter suffix patterns common to warrants/units (approx)
    # Example: ABCW, ABCWS, ABCU
    for suf in BAD_SUFFIXES:
        if base.endswith(suf) and len(base) > len(suf):
            return False
    return True

def main():
    nas = download(NASDAQ_LISTED)
    oth = download(OTHER_LISTED)

    nas_syms = parse_pipe_file(nas, "Symbol")
    oth_syms = parse_pipe_file(oth, "ACT Symbol")

    all_syms = []
    seen = set()

    for s in nas_syms + oth_syms:
        s2 = normalize_for_stooq(s)
        if not is_reasonable(s2):
            continue
        if s2 not in seen:
            seen.add(s2)
            all_syms.append(s2)

    # Cap to 1200 (aggressive but reliable)
    universe = all_syms[:MAX_TICKERS]

    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/universe.txt").write_text("\n".join(universe) + "\n", encoding="utf-8")
    print(f"Wrote {len(universe)} tickers to data/universe.txt")

if __name__ == "__main__":
    main()
