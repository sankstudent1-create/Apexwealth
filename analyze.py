"""CLI: analyze a DOP (India Post) AccountSummary .xls file.

Usage:
    python analyze.py [path/to/AccountSummary.xls]
    APEX_DOP_FILE=path/to/AccountSummary.xls python analyze.py

If no path is given, the CLI looks for a local AccountSummary*.xls in the
current directory and in ~/Downloads. There is NO bundled default file in this
repo (the old code imported parse_account_summary_file and DEFAULT_FILE_PATH
from server.py, neither of which existed, so the CLI crashed on import).
When no file can be found, or a required library is missing, the CLI prints a
clear message and exits with code 2 instead of a traceback.

Output: KPI table, scheme breakdown, maturity-year timeline, top 10 accounts
(identifiers shown masked, as in the web app), plus a clean CSV export next
to this file. Requires only xlrd for parsing; rich is optional (plain-text
fallback when absent).
"""

import csv
import glob
import os
import re
import sys

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    console = Console(force_terminal=True, highlight=False)
except ImportError:
    # Plain-text fallback: strip rich markup, print tables simply.
    class _PlainConsole:
        def print(self, *args, **kwargs):
            for a in args:
                text = str(a)
                text = re.sub(r"\[/?[a-z_ ]+\]", "", text)
                print(text)
    console = _PlainConsole()
    Table = Panel = None

try:
    from server import parse_dop_summary, DEFAULT_RATES
except ImportError as exc:
    print(f"Cannot run: failed to import the parser from server.py ({exc}).")
    print("Install the parser dependencies first: pip install xlrd openpyxl")
    raise SystemExit(2)


def resolve_default_file():
    """Return a DOP .xls path from argv, env, or local discovery, else None."""
    if len(sys.argv) > 1:
        return sys.argv[1]
    env_path = os.environ.get("APEX_DOP_FILE")
    if env_path:
        return env_path
    candidates = sorted(glob.glob("AccountSummary*.xls"))
    candidates += sorted(glob.glob(os.path.expanduser("~/Downloads/AccountSummary*.xls")))
    return candidates[0] if candidates else None


def build_type_breakdown(records, total_balance):
    grouped = {}
    for r in records:
        code = r.get("category_code") or "OTHER"
        grouped.setdefault(code, {"count": 0, "total": 0.0})
        grouped[code]["count"] += 1
        grouped[code]["total"] += r.get("balance", 0.0)
    out = []
    for code in sorted(grouped):
        g = grouped[code]
        out.append({
            "type": code,
            "count": g["count"],
            "total_balance": round(g["total"], 2),
            "percentage": round((g["total"] / total_balance * 100) if total_balance else 0, 2),
            "avg_balance": round(g["total"] / g["count"], 2) if g["count"] else 0.0,
        })
    return out


def build_maturity_timeline(records):
    grouped = {}
    for r in records:
        m = re.search(r"(20\d{2})", str(r.get("maturity_date") or ""))
        year = m.group(1) if m else "No maturity date"
        grouped.setdefault(year, {"count": 0, "balance": 0.0})
        grouped[year]["count"] += 1
        grouped[year]["balance"] += r.get("balance", 0.0)
    dated = sorted((y, g) for y, g in grouped.items() if y != "No maturity date")
    out = [{"year": y, "count": g["count"], "balance": round(g["balance"], 2)} for y, g in dated]
    if "No maturity date" in grouped:
        g = grouped["No maturity date"]
        out.append({"year": "No maturity date", "count": g["count"], "balance": round(g["balance"], 2)})
    return out


def run_cli_analysis(file_path):
    if not file_path:
        print("Error: no DOP file given and none found.")
        print("Usage: python analyze.py [path/to/AccountSummary.xls]")
        print("   or: APEX_DOP_FILE=path/to/AccountSummary.xls python analyze.py")
        print("Looked for AccountSummary*.xls in the current directory and ~/Downloads.")
        return 2
    if not os.path.exists(file_path):
        print(f"Error: file not found at {file_path}")
        return 2

    try:
        data = parse_dop_summary(file_path)
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"Error: {exc}")
        return 2

    meta = data["metadata"]
    records = data["records"]
    total_balance = meta["total_balance"]
    type_breakdown = build_type_breakdown(records, total_balance)
    maturity_timeline = build_maturity_timeline(records)
    top_accounts = sorted(records, key=lambda r: r.get("balance", 0.0), reverse=True)[:10]

    if Table is not None:
        console.print(Panel.fit(
            f"[bold cyan]Post Office Financial Account Analyzer Engine[/]\n"
            f"[yellow]File:[/] {file_path}\n"
            f"[yellow]Rates:[/] RD {DEFAULT_RATES['rd_rate']}% / "
            f"TD {DEFAULT_RATES['td_rate']}% / SB {DEFAULT_RATES['sb_rate']}%",
            title="DOP / Post Office Account Analytics",
            border_style="cyan",
        ))

        table_kpi = Table(title="[bold green]Key Portfolio Metrics[/]", border_style="green", header_style="bold green")
        table_kpi.add_column("Metric", style="cyan")
        table_kpi.add_column("Value", style="bold yellow")
        table_kpi.add_row("Total Active Accounts", f"{meta['parsed_rows']:,}")
        table_kpi.add_row("Total Portfolio Balance", f"{meta['total_balance_formatted']}")
        table_kpi.add_row("Average Balance / Account", f"{meta['avg_balance_formatted']}")
        table_kpi.add_row("Account Schemes/Types", f"{len(type_breakdown)}")
        table_kpi.add_row("Primary Branch / Post Office", ", ".join(meta['post_offices']))
        console.print(table_kpi)
        console.print()

        table_types = Table(title="[bold blue]Portfolio Breakdown by Account Scheme[/]", border_style="blue", header_style="bold blue")
        table_types.add_column("Account Scheme", style="white")
        table_types.add_column("Accounts", justify="right", style="cyan")
        table_types.add_column("Total Balance", justify="right", style="bold green")
        table_types.add_column("Balance Share", justify="right", style="magenta")
        table_types.add_column("Average / Acc", justify="right", style="yellow")
        for item in type_breakdown:
            table_types.add_row(item["type"], f"{item['count']:,}",
                                f"Rs. {item['total_balance']:,.2f}",
                                f"{item['percentage']}%", f"Rs. {item['avg_balance']:,.2f}")
        console.print(table_types)
        console.print()

        table_mat = Table(title="[bold magenta]Maturity Forecast by Year[/]", border_style="magenta", header_style="bold magenta")
        table_mat.add_column("Maturity Year", justify="center", style="cyan")
        table_mat.add_column("Accounts Maturing", justify="right", style="yellow")
        table_mat.add_column("Maturing Balance", justify="right", style="bold green")
        for m in maturity_timeline:
            table_mat.add_row(m["year"], f"{m['count']:,}", f"Rs. {m['balance']:,.2f}")
        console.print(table_mat)
        console.print()

        table_top = Table(title="[bold yellow]Top 10 High-Value Accounts (masked)[/]", border_style="yellow", header_style="bold yellow")
        table_top.add_column("Account Number", style="cyan")
        table_top.add_column("Account Type", style="white")
        table_top.add_column("Balance", justify="right", style="bold green")
        table_top.add_column("Open Date", style="blue")
        table_top.add_column("Maturity Date", style="magenta")
        for top in top_accounts:
            table_top.add_row(top.get("account_number_masked", "****"),
                              top["account_type"], top["balance_formatted"],
                              top["open_date"] or "-", top["maturity_date"] or "-")
        console.print(table_top)
    else:
        print(f"Accounts: {meta['parsed_rows']:,}  Balance: {meta['total_balance_formatted']}")
        for item in type_breakdown:
            print(f"  {item['type']}: {item['count']} accounts, Rs. {item['total_balance']:,.2f} ({item['percentage']}%)")
        for m in maturity_timeline:
            print(f"  {m['year']}: {m['count']} accounts, Rs. {m['balance']:,.2f}")

    out_dir = os.path.dirname(os.path.abspath(__file__))
    clean_csv_path = os.path.join(out_dir, "account_summary_clean.csv")
    if records:
        with open(clean_csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(records[0].keys()))
            writer.writeheader()
            writer.writerows(records)
    console.print(f"\n[green]✓ Clean CSV exported to:[/] {clean_csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run_cli_analysis(resolve_default_file()))
