import os
import sys

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import xlrd
import pandas as pd
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from server import parse_account_summary_file, DEFAULT_FILE_PATH

console = Console(force_terminal=True, highlight=False)

def run_cli_analysis(file_path=DEFAULT_FILE_PATH):
    if not os.path.exists(file_path):
        console.print(f"[bold red]Error:[/] File not found at {file_path}")
        return
        
    console.print(Panel.fit(
        f"[bold cyan]Post Office Financial Account Analyzer Engine[/]\n[yellow]File:[/] {file_path}",
        title="DOP / Post Office Account Analytics",
        border_style="cyan"
    ))
    
    data = parse_account_summary_file(file_path)
    meta = data["metadata"]
    
    # 1. Summary Cards
    table_kpi = Table(title="[bold green]Key Portfolio Metrics[/]", border_style="green", header_style="bold green")
    table_kpi.add_column("Metric", style="cyan")
    table_kpi.add_column("Value", style="bold yellow")
    
    table_kpi.add_row("Total Active Accounts", f"{meta['parsed_rows']:,}")
    table_kpi.add_row("Total Portfolio Balance", f"{meta['total_balance_formatted']}")
    table_kpi.add_row("Average Balance / Account", f"{meta['avg_balance_formatted']}")
    table_kpi.add_row("Account Schemes/Types", f"{meta['account_types_count']}")
    table_kpi.add_row("Primary Branch / Post Office", ", ".join(meta['post_offices']))
    
    console.print(table_kpi)
    console.print()
    
    # 2. Breakdown by Account Type
    table_types = Table(title="[bold blue]Portfolio Breakdown by Account Scheme[/]", border_style="blue", header_style="bold blue")
    table_types.add_column("Account Scheme", style="white")
    table_types.add_column("Accounts", justify="right", style="cyan")
    table_types.add_column("Total Balance", justify="right", style="bold green")
    table_types.add_column("Balance Share", justify="right", style="magenta")
    table_types.add_column("Average / Acc", justify="right", style="yellow")
    
    for item in data["type_breakdown"]:
        table_types.add_row(
            item["type"],
            f"{item['count']:,}",
            f"Rs. {item['total_balance']:,.2f}",
            f"{item['percentage']}%",
            f"Rs. {item['avg_balance']:,.2f}"
        )
    console.print(table_types)
    console.print()
    
    # 3. Maturity Year Timeline
    table_mat = Table(title="[bold magenta]Maturity Forecast by Year[/]", border_style="magenta", header_style="bold magenta")
    table_mat.add_column("Maturity Year", justify="center", style="cyan")
    table_mat.add_column("Accounts Maturing", justify="right", style="yellow")
    table_mat.add_column("Maturing Balance", justify="right", style="bold green")
    
    for m in data["maturity_timeline"]:
        table_mat.add_row(m["year"], f"{m['count']:,}", f"Rs. {m['balance']:,.2f}")
        
    console.print(table_mat)
    console.print()
    
    # 4. Top Accounts
    table_top = Table(title="[bold yellow]Top 10 High-Value Accounts[/]", border_style="yellow", header_style="bold yellow")
    table_top.add_column("Account Number", style="cyan")
    table_top.add_column("Account Type", style="white")
    table_top.add_column("Balance", justify="right", style="bold green")
    table_top.add_column("Open Date", style="blue")
    table_top.add_column("Maturity Date", style="magenta")
    
    for top in data["top_accounts"]:
        table_top.add_row(
            top["account_number"],
            top["account_type"],
            top["balance_formatted"],
            top["open_date"] or "-",
            top["maturity_date"] or "-"
        )
        
    console.print(table_top)
    
    # Export clean CSV
    out_dir = os.path.dirname(os.path.abspath(__file__))
    clean_csv_path = os.path.join(out_dir, "account_summary_clean.csv")
    df = pd.DataFrame(data["records"])
    df.to_csv(clean_csv_path, index=False)
    console.print(f"\n[green]✓ Clean CSV exported to:[/] {clean_csv_path}")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FILE_PATH
    run_cli_analysis(target)
