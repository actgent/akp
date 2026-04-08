# AKP — Agent Knowledge Protocol

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

## 12 Tools

### Articles (5)

| Tool | Description |
|------|-------------|
| `akp_write` | Create or update a knowledge article |
| `akp_search` | Search articles by query or list by recency |
| `akp_read` | Get a specific article by ID |
| `akp_list` | List articles with filters, or list collections |
| `akp_feedback` | Report if knowledge was helpful or harmful |

### Memory (3)

| Tool | Description |
|------|-------------|
| `akp_memory_store` | Store an episodic memory (situation/outcome pair) |
| `akp_memory_search` | Search memories by query, or list recent |
| `akp_memory_delete` | Delete an episodic memory |

### Assets (4)

| Tool | Description |
|------|-------------|
| `akp_asset_upload` | Upload a file, or pin an existing asset |
| `akp_asset_get` | Get asset metadata and download URL |
| `akp_asset_list` | List files by zone, path, or linked entity |
| `akp_asset_delete` | Delete a file |

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

## Collections

Organize articles with slash-separated paths:

```yaml
collection: engineering/backend
```

Search with prefix matching — `collection: "engineering"` matches all articles in `engineering/*`.

## Episodic Memory

Agents store situation/outcome pairs that decay over time (90-day TTL). Link memories to articles, projects, conversations, or tasks.

```
akp_memory_store:
  situation: "Deployed API v2 to production"
  outcome: "Success — latency dropped 30%"
  tags: [deploy, api]
  project_id: "proj_abc"
```

## File Assets

Two lifecycle zones:
- **Permanent** — user uploads, never auto-deleted
- **Staging** — agent-generated content, FIFO-rotated when quota fills

Pin a staging asset to permanent to keep it.

## Document Format

```yaml
akp: "1.0"
id: "d7f3a2b1-4e5c-4a8b-9c1d-2e3f4a5b6c7d"
title: "Never deploy on Friday afternoon"
type: anti-pattern
maturity: proven
tags: [devops, deploy, safety]
collection: engineering/devops
project_id: null
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

For **semantic search**, **team sharing**, and the **full agent backend** (memory, assets, projects, tasks, media generation, browser automation):

[hexaclaw.com](https://hexaclaw.com)

## Specification

Full protocol specification: [spec/AKP-SPEC-v1.0.md](spec/AKP-SPEC-v1.0.md)

Design rationale: [spec/RATIONALE.md](spec/RATIONALE.md)

## License

Apache 2.0
