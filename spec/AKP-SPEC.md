# AKP: Agent Knowledge Platform

**Version:** 0.1.0-draft
**Status:** Draft
**License:** Apache 2.0
**Authors:** HexaClaw

## 1. Introduction

AI agents can connect to tools (MCP), follow procedures (Agent Skills), and communicate with each other (A2A). But they cannot organize, version, or share what they learn.

Every agent platform stores knowledge differently. Mem0 stores flat memories. Zep builds temporal graphs. LangGraph uses JSON stores. When you switch platforms, your agent's knowledge stays behind. When two agents need to share what they've learned, there is no common format.

AKP fills this gap. It defines a portable format for structured agent knowledge, a lifecycle for how knowledge matures through use, and five operations for reading, writing, searching, and improving knowledge over time.

## 2. Conformance

The key words "MUST", "SHOULD", "MAY" in this document are to be interpreted as described in RFC 2119.

Implementations MUST support the document format and all five operations. Implementations SHOULD support semantic search. Implementations MAY extend AKP via extension points defined in Section 11.

## 3. Document Format

An AKP document is a YAML frontmatter block followed by a Markdown body, stored as `.akp.yaml` or `.akp.md`.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `akp` | string | Spec version. MUST be `"0.1"` |
| `id` | string | UUID v4 identifier |
| `title` | string | Human-readable title (max 200 chars) |
| `type` | enum | One of the six article types (Section 4) |
| `created_at` | string | ISO 8601 timestamp |
| `updated_at` | string | ISO 8601 timestamp |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maturity` | enum | `"draft"` | Maturity level (Section 5) |
| `tags` | string[] | `[]` | Categorization labels |
| `namespace` | string | `"default"` | Logical grouping |
| `scope` | enum | `"private"` | Visibility: `private`, `team`, `global` |
| `confidence` | number | `0.7` | 0.0–1.0 confidence score |
| `version` | integer | `1` | Increments on each update |
| `created_by` | string | — | Agent or user identifier |
| `related` | string[] | `[]` | IDs of related articles |
| `expires_at` | string | — | ISO 8601 expiration timestamp |
| `summary` | string | — | Short summary (max 300 chars) |

### Example Document

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
created_by: "agent:deploy-bot"
version: 1
---
Deployments after 3pm Friday have a 3x higher incident rate
due to reduced staffing for incident response over the weekend.

## What to do instead
- Schedule deployments for Monday–Thursday before 2pm
- If a Friday deploy is unavoidable, ensure on-call coverage through the weekend
```

## 4. Article Types

AKP defines six article types. Each serves a distinct purpose in an agent's knowledge base.

| Type | Purpose | Example |
|------|---------|---------|
| `fact` | An atomic, verifiable statement | "PostgreSQL max_connections defaults to 100" |
| `procedure` | Step-by-step instructions | "How to rotate API keys in production" |
| `decision` | A recorded choice with context and rationale | "We chose Postgres over DynamoDB because..." |
| `reference` | Lookup information (APIs, configs, limits) | "Rate limits: 100 req/min on free tier" |
| `playbook` | Multi-step response plan for a situation | "When the database is slow: check X, then Y" |
| `anti-pattern` | A known bad practice with explanation | "Never use SELECT * in production queries" |

Implementations MUST support all six types. Implementations MAY support additional types prefixed with `x-` (e.g., `x-meeting-notes`).

## 5. Maturity Lifecycle

Knowledge matures through use. AKP defines five maturity levels and a feedback-driven transition model.

```
draft ──→ candidate ──→ established ──→ proven
  │           │              │             │
  └───────────┴──────────────┴─────────→ deprecated
```

### Transition Rules

| From | To | Condition |
|------|----|-----------|
| draft | candidate | `helpful_count >= 3` |
| candidate | established | `helpful_count >= 8` AND `harmful_ratio < 0.25` |
| established | proven | `helpful_count >= 20` AND `harmful_ratio < 0.20` |
| any | deprecated | `total_feedback >= 5` AND `harmful_ratio > 0.40` |

Where `harmful_ratio = harmful_count / (helpful_count + harmful_count)` and harmful feedback is weighted 4x in ratio calculation.

Implementations MUST compute maturity after each feedback event. The `deprecated` state is terminal — articles can only be un-deprecated via a write operation that resets feedback counts.

### Authority Lock

Implementations MAY support an `authority_locked: true` field that exempts an article from feedback-driven maturity changes. This is intended for compliance, legal, or other authoritative knowledge that should not be subject to agent voting.

## 6. Operations

AKP defines five operations. All implementations MUST support these operations.

### 6.1 write

Create a new article or update an existing one.

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `title` | yes (create) | Article title |
| `content` | yes (create) | Markdown body |
| `type` | yes (create) | Article type enum |
| `id` | no | If provided and exists, updates the article |
| `summary` | no | Short summary |
| `tags` | no | Tag array |
| `namespace` | no | Namespace string |
| `scope` | no | Visibility scope |
| `related` | no | Related article IDs |
| `expires_at` | no | Expiration timestamp |
| `change_summary` | yes (update) | Description of changes |

**Behavior:**
- On create: generate UUID, set `version: 1`, set `maturity: draft`, set `helpful_count: 0`, `harmful_count: 0`
- On update: increment `version`, archive previous version (ring buffer, max 5), update `updated_at`

**Output:** The full article object.

### 6.2 search

Find articles by query text.

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `query` | yes | Search text |
| `type` | no | Filter by article type |
| `namespace` | no | Filter by namespace |
| `maturity` | no | Filter by maturity level |
| `scope` | no | Filter by scope |
| `tags` | no | Filter by tags |
| `limit` | no | Max results (default 5, max 20) |

**Behavior:** Implementations MUST support keyword search. Implementations SHOULD support semantic search via embeddings.

**Output:** Array of articles with relevance scores.

### 6.3 read

Retrieve a single article by ID.

**Input:** `id` (required)

**Output:** Full article including content, metadata, and version history.

### 6.4 list

Enumerate articles with optional filters.

**Input:** Same filters as `search` minus `query`. Default `limit: 20`, max 50.

**Output:** Array of article summaries (title, type, maturity, tags — no full content).

### 6.5 feedback

Record whether knowledge was helpful or harmful.

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Article ID |
| `outcome` | yes | `"helpful"`, `"harmful"`, or `"neutral"` |

**Behavior:** Increment the appropriate counter. Recompute maturity per Section 5 rules. Return updated maturity state.

**Output:** `{ id, outcome, helpful_count, harmful_count, maturity, maturity_changed }`

## 7. Scoping

| Scope | Visibility |
|-------|-----------|
| `private` | Only the creating agent/user |
| `team` | All agents/users in the same workspace |
| `global` | All users of the platform |

Implementations MUST support at least `private` scope. Multi-tenant implementations SHOULD support all three.

## 8. Versioning

Each write operation increments `version` by 1. Previous versions are stored in a ring buffer with a configurable maximum (default: 5).

Each version snapshot contains:
- `version` (integer)
- `title` (string)
- `content` (string)
- `updated_by` (string)
- `updated_at` (ISO 8601)
- `change_summary` (string)

## 9. Error Handling

Implementations MUST return structured errors:

| Code | Name | When |
|------|------|------|
| 400 | `INVALID_TYPE` | Unknown article type |
| 400 | `INVALID_MATURITY` | Unknown maturity level |
| 400 | `VALIDATION_ERROR` | Missing required fields |
| 404 | `ARTICLE_NOT_FOUND` | ID does not exist |
| 500 | `STORAGE_ERROR` | Backend failure |

## 10. MCP Transport Binding

AKP operations map to five MCP tools:

| Operation | MCP Tool Name |
|-----------|---------------|
| write | `akp_write` |
| search | `akp_search` |
| read | `akp_read` |
| list | `akp_list` |
| feedback | `akp_feedback` |

Tool schemas are defined in Appendix A.

## 11. Extension Points

Implementations MAY extend AKP in the following ways:

- **Custom article types:** Prefix with `x-` (e.g., `x-meeting-notes`, `x-alert`)
- **Custom metadata fields:** Prefix with `x_` in frontmatter (e.g., `x_severity: critical`)
- **Typed relationships** (future v0.2): The `related` field may evolve to support typed, directional relations (supersedes, contradicts, depends-on, part-of)
- **Temporal validity** (future v0.2): `valid_from` / `valid_until` for time-bounded knowledge
- **Structured conditions** (future v0.2): Applicability predicates for context-dependent knowledge
- **Attachments** (future v0.3): Binary/media references with MIME types

## Appendix A: MCP Tool Schemas

### akp_write

```json
{
  "name": "akp_write",
  "description": "Create or update a knowledge article",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Article title" },
      "content": { "type": "string", "description": "Markdown content" },
      "type": { "type": "string", "enum": ["fact", "procedure", "decision", "reference", "playbook", "anti-pattern"] },
      "id": { "type": "string", "description": "UUID to update existing article" },
      "summary": { "type": "string" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "namespace": { "type": "string" },
      "scope": { "type": "string", "enum": ["private", "team", "global"] },
      "related": { "type": "array", "items": { "type": "string" } },
      "expires_at": { "type": "string", "description": "ISO 8601 expiration" },
      "change_summary": { "type": "string", "description": "Required for updates" }
    },
    "required": ["title", "content", "type"]
  }
}
```

### akp_search

```json
{
  "name": "akp_search",
  "description": "Search knowledge articles by query",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "type": { "type": "string", "enum": ["fact", "procedure", "decision", "reference", "playbook", "anti-pattern"] },
      "namespace": { "type": "string" },
      "maturity": { "type": "string", "enum": ["draft", "candidate", "established", "proven", "deprecated"] },
      "tags": { "type": "array", "items": { "type": "string" } },
      "limit": { "type": "number" }
    },
    "required": ["query"]
  }
}
```

### akp_read

```json
{
  "name": "akp_read",
  "description": "Get a knowledge article by ID",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" }
    },
    "required": ["id"]
  }
}
```

### akp_list

```json
{
  "name": "akp_list",
  "description": "List knowledge articles with filters",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "enum": ["fact", "procedure", "decision", "reference", "playbook", "anti-pattern"] },
      "namespace": { "type": "string" },
      "maturity": { "type": "string", "enum": ["draft", "candidate", "established", "proven", "deprecated"] },
      "tags": { "type": "array", "items": { "type": "string" } },
      "limit": { "type": "number" }
    }
  }
}
```

### akp_feedback

```json
{
  "name": "akp_feedback",
  "description": "Report whether knowledge was helpful or harmful",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "outcome": { "type": "string", "enum": ["helpful", "harmful", "neutral"] }
    },
    "required": ["id", "outcome"]
  }
}
```
