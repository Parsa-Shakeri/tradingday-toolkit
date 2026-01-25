import re
from pathlib import Path
from urllib.request import urlopen

# Official symbol directories (pipe-delimited with header + footer)
NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt"
OTHER_LISTED  = "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"

# Keep universe manageable so fetch doesn't time out
MAX_TICKERS = 1200  # change to 800 / 1500 if you want

def download(url: str) -> str:
    with urlopen(url, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")

def parse_symbols(text: str, symbol_col_name: str) -> list[str]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    header = lines[0].split("|")
    try:
        si = header.index(symbol_col_name)
    except ValueError:
        raise RuntimeError(f"Symbol column '{symbol_col_name}' not found in header")

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

        # Filter out weird / test / non-common-stock stuff as best we can without extra metadata:
        # - NASDAQ uses special characters for some issues (e.g., warrants, units)
        # - We'll allow dot-share classes (BRK.B) but Stooq sometimes uses BRK-B format.
        if sym in ("TEST", "TESTA", "TESTB"):
            continue

        # remove symbols containing '^' or '/' etc.
        if re.search(r"[^A-Z0-9.\-]", sym):
            continue

        syms.append(sym)

    return syms

def normalize_for_stooq(sym: str) -> str:
    # Stooq often expects BRK-B instead of BRK.B
    return sym.replace(".", "-")

def main():
    nas_text = download(NASDAQ_LISTED)
    oth_text = download(OTHER_LISTED)

    nas_syms = parse_symbols(nas_text, "Symbol")
    oth_syms = parse_symbols(oth_text, "ACT Symbol")

    # Combine, de-dup, preserve order
    seen = set()
    all_syms = []
    for s in nas_syms + oth_syms:
        s2 = normalize_for_stooq(s)
        if s2 not in seen:
            seen.add(s2)
            all_syms.append(s2)

    # Hard cap to avoid timeouts/throttling
    universe = all_syms[:MAX_TICKERS]

    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/universe.txt").write_text("\n".join(universe) + "\n", encoding="utf-8")

    print(f"Wrote {len(universe)} tickers to data/universe.txt")

if __name__ == "__main__":
    main()
