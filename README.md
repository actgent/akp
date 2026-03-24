# AKP — Agent Knowledge Platform

An open standard for how AI agents organize, share, and evolve knowledge.

MCP connects agents to tools. Agent Skills give agents procedures. **AKP gives agents knowledge.**

## Quick Start

```bash
npx @hexaclaw/akp-server
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "akp": {
      "command": "npx",
      "args": ["-y", "@hexaclaw/akp-server"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "akp": {
      "command": "npx",
      "args": ["-y", "@hexaclaw/akp-server"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add akp -- npx -y @hexaclaw/akp-server
```

## 5 Tools

| Tool | Description |
|------|-------------|
| `akp_write` | Create or update a knowledge article |
| `akp_search` | Find articles by query (keyword search) |
| `akp_read` | Get a specific article by ID |
| `akp_list` | List articles with filters |
| `akp_feedback` | Report if knowledge was helpful or harmful |

## 6 Article Types

| Type | Purpose | Example |
|------|---------|---------|
| `fact` | Verifiable statement | "PostgreSQL max_connections defaults to 100" |
| `procedure` | Step-by-step instructions | "How to rotate API keys" |
| `decision` | Recorded choice with rationale | "We chose Postgres over DynamoDB because..." |
| `reference` | Lookup information | "Rate limits: 100 req/min on free tier" |
| `playbook` | Operational response plan | "When DB is slow: check X, then Y" |
| `anti-pattern` | Known bad practice | "Never use SELECT * in production" |

## Maturity Lifecycle

Knowledge matures through use. Articles auto-promote with positive feedback and auto-deprecate with negative feedback.

```
draft → candidate → established → proven
                                    ↓
                              deprecated
```

| Transition | Condition |
|------------|-----------|
| draft → candidate | 3+ helpful feedback |
| candidate → established | 8+ helpful, <25% harmful |
| established → proven | 20+ helpful, <20% harmful |
| any → deprecated | 5+ total, >40% harmful |

## Document Format

```yaml
akp: "0.1"
id: "d7f3a2b1-4e5c-4a8b-9c1d-2e3f4a5b6c7d"
title: "Never deploy on Friday afternoon"
type: anti-pattern
maturity: proven
tags: [devops, deploy, safety]
namespace: engineering
scope: team
confidence: 0.95
created_at: "2026-03-23T10:00:00Z"
updated_at: "2026-03-23T10:00:00Z"
---
Deployments after 3pm Friday have a 3x higher incident rate.

## What to do instead
Schedule for Monday–Thursday before 2pm.
```

## Storage

By default, articles are stored locally in `~/.akp/knowledge.db` (SQLite). Override with:

```bash
AKP_DB_PATH=/path/to/knowledge.db npx @hexaclaw/akp-server
```

## HexaClaw Cloud

For **semantic search**, **team sharing**, and the **full agent backend** (memory, tasks, vault, media generation, browser automation):

[hexaclaw.com](https://hexaclaw.com)

## Specification

Full protocol specification: [spec/AKP-SPEC.md](spec/AKP-SPEC.md)

Design rationale: [spec/RATIONALE.md](spec/RATIONALE.md)

## License

Apache 2.0
