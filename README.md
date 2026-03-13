# Claude Cost Tracker

Track and visualize your Claude Code session costs. Parses JSONL session files locally, calculates per-message costs using Anthropic's pricing, and renders an interactive dashboard.

## Quick Start

```bash
npx claude-cost-tracker
```

This auto-discovers your sessions from `~/.claude/projects/`, starts a local server, and opens the dashboard in your browser.

## CLI Options

```bash
# Custom JSONL directory
npx claude-cost-tracker --dir /path/to/sessions

# Multiple directories (e.g. personal + work laptop)
npx claude-cost-tracker --dir ~/.claude/projects --dir ./work-sessions

# Custom port
npx claude-cost-tracker --port 8080
```

## Features

- **Session overview** — sortable table with cost, tokens, duration, model
- **Per-message drill-down** — click any session to see per-message costs with cumulative totals
- **Sub-agent tracking** — see what each sub-agent/research team member cost
- **Cost grouping** — visual dividers every $5 (configurable) to spot expensive chunks
- **Charts** — daily cost trend, cost by model, top 10 most expensive sessions
- **Filters** — by model, date range, minimum cost
- **Export** — CSV and JSON export
- **Currency toggle** — USD/EUR with one click

## How It Works

1. Reads Claude Code JSONL session files from `~/.claude/projects/`
2. Parses server-side — extracts only cost-relevant data (tokens, model, timestamps)
3. Calculates costs using Anthropic's per-token pricing table
4. Renders everything in a local React dashboard

**Your data never leaves your machine.** Everything runs locally.

## Pricing

Costs are calculated using Anthropic's official pricing (as of March 2026):

| Model | Input | Output | Cache Read | Cache Write (1h) |
|-------|-------|--------|------------|------------------|
| Opus 4.6/4.5 | $5/MTok | $25/MTok | $0.50/MTok | $10/MTok |
| Sonnet 4.x | $3/MTok | $15/MTok | $0.30/MTok | $6/MTok |
| Haiku 4.5 | $1/MTok | $5/MTok | $0.10/MTok | $2/MTok |

## License

MIT
