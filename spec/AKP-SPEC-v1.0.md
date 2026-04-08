# AKP: Agent Knowledge Protocol

**Version:** 1.0.0-draft
**Status:** Draft
**License:** Apache 2.0
**Authors:** HexaClaw

## 1. Introduction

AI agents can connect to tools (MCP), follow procedures (Agent Skills), and communicate with each other (A2A). But they cannot organize, version, or share what they learn.

Every agent platform stores knowledge differently. Mem0 stores flat memories. Zep builds temporal graphs. LangGraph uses JSON stores. When you switch platforms, your agent's knowledge stays behind. When two agents need to share what they've learned, there is no common format.

AKP fills this gap. It defines:

- A **portable format** for structured agent knowledge (articles)
- A **lifecycle** for how knowledge matures through use (maturity)
- **Episodic memory** for experiential recall (memories)
- **Hierarchical organization** via path-based collections (collections)
- **File management** with lifecycle zones (assets)

AKP v1.0 covers the three things an agent's knowledge layer needs: **what it knows** (articles), **what it experienced** (memories), and **what it produced** (assets).

## 2. Conformance

The key words "MUST", "SHOULD", "MAY" in this document are to be interpreted as described in RFC 2119.

**Core conformance** (MUST): Article format, article types, maturity lifecycle, article operations (write, search, read, list, feedback).

**Extended conformance** (SHOULD): Episodic memory, assets.

**Optional** (MAY): Semantic search, custom types, extension fields.

## 3. Identity and Authentication

AKP does not define an authentication mechanism. Identity is a transport-layer concern.

Implementations MUST associate each operation with a **principal** — an opaque string identifying the acting user or agent. How the principal is established (API key, OAuth token, session, localhost trust) is outside the scope of this specification.

Scoping rules (Section 11) use the principal to determine visibility.

---

# PART I: ARTICLES

## 4. Document Format

An AKP article is a YAML frontmatter block followed by a Markdown body, stored as `.akp.yaml` or `.akp.md`.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `akp` | string | Spec version. MUST be `"1.0"` |
| `id` | string | UUID v4 identifier |
| `title` | string | Human-readable title (max 200 chars) |
| `type` | enum | One of the six article types (Section 5) |
| `created_at` | string | ISO 8601 timestamp |
| `updated_at` | string | ISO 8601 timestamp |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maturity` | enum | `"draft"` | Maturity level (Section 6) |
| `tags` | string[] | `[]` | Categorization labels |
| `project_id` | string | — | Project this article belongs to. `null` = general knowledge. |
| `collection` | string | `""` | Slash-separated path (e.g., `engineering/backend`). See Section 8. |
| `scope` | enum | `"private"` | Visibility: `private`, `team`, `global` |
| `confidence` | number | `0.7` | Confidence score, float in range `[0.0, 1.0]` |
| `version` | integer | `1` | Increments on each update |
| `created_by` | string | — | Agent or user identifier |
| `related` | string[] | `[]` | IDs of related articles |
| `expires_at` | string | — | ISO 8601 expiration timestamp |
| `summary` | string | — | Short summary (max 300 chars) |

### Deprecated Fields

| Field | Replacement | Notes |
|-------|-------------|-------|
| `namespace` | `collection` | Still accepted; treated as a single-segment collection path |

### Example Document

```yaml
akp: "1.0"
id: "d7f3a2b1-4e5c-4a8b-9c1d-2e3f4a5b6c7d"
title: "Never deploy on Friday afternoon"
type: anti-pattern
maturity: proven
tags: [devops, deploy, safety]
collection: engineering/devops
scope: team
confidence: 0.95
created_at: "2026-03-23T10:00:00Z"
updated_at: "2026-03-23T10:00:00Z"
created_by: "agent:deploy-bot"
version: 1
related:
  - "e4f5a6b7-8c9d-0e1f-2a3b-4c5d6e7f8a9b"
---
Deployments after 3pm Friday have a 3x higher incident rate
due to reduced staffing for incident response over the weekend.

## What to do instead
- Schedule deployments for Monday–Thursday before 2pm
- If a Friday deploy is unavoidable, ensure on-call coverage through the weekend
```

## 5. Article Types

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

## 6. Maturity Lifecycle

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

## 7. Article Operations

### 7.1 write

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
| `project_id` | no | Project ID (null = general knowledge) |
| `collection` | no | Collection path string |
| `scope` | no | Visibility scope |
| `related` | no | Related article IDs |
| `expires_at` | no | Expiration timestamp |
| `change_summary` | yes (update) | Description of changes |

**Behavior:**
- On create: generate UUID, set `version: 1`, set `maturity: draft`, set `helpful_count: 0`, `harmful_count: 0`
- On update: increment `version`, archive previous version (ring buffer, max 5), update `updated_at`
- If `collection` path does not exist, it is created implicitly

**Output:** The full article object.

### 7.2 search

Find articles by query text.

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `query` | no | Search text. If omitted, returns articles by recency. |
| `type` | no | Filter by article type |
| `project_id` | no | Filter by project (null = general only, omit = all projects) |
| `collection` | no | Filter by collection path (prefix match — `engineering` matches `engineering/backend`) |
| `maturity` | no | Filter by maturity level |
| `scope` | no | Filter by scope |
| `tags` | no | Filter by tags |
| `include_deprecated` | no | Include deprecated articles (default: `false`) |
| `limit` | no | Max results (default 10, max 50) |
| `cursor` | no | Pagination cursor from previous response |

**Behavior:**
- With `query`: search by keyword or semantic similarity. Implementations MUST support keyword search. Implementations SHOULD support semantic search via embeddings.
- Without `query`: return articles sorted by `updated_at` descending.
- When `collection` is provided, search MUST include articles in the specified collection and all sub-collections (prefix match on the collection path).
- Deprecated articles are excluded by default. Set `include_deprecated: true` to include them.

**Output:** Array of articles with relevance scores (when searching), plus `next_cursor` if more results exist.

```json
{
  "articles": [...],
  "next_cursor": "eyJ..." | null
}
```

### 7.3 read

Retrieve a single article by ID.

**Input:** `id` (required)

**Output:** Full article including content, metadata, and version history.

### 7.4 list

Enumerate articles with optional filters.

**Input:** Same filters as `search` minus `query`. Plus `cursor` for pagination. Default `limit: 20`, max 50.

**Output:** Array of article summaries (title, type, maturity, tags, collection — no full content), plus `next_cursor`.

### 7.5 feedback

Record whether knowledge was helpful or harmful.

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Article ID |
| `outcome` | yes | `"helpful"`, `"harmful"`, or `"neutral"` |

**Behavior:** Increment the appropriate counter. Recompute maturity per Section 6 rules. Return updated maturity state.

**Output:**

```json
{
  "id": "...",
  "outcome": "helpful",
  "helpful_count": 4,
  "harmful_count": 0,
  "maturity": "candidate",
  "maturity_changed": true
}
```

---

# PART II: ORGANIZATION

## 8. Collections

Collections are **path strings** on articles — not separate entities. The collection field uses slash-separated segments to represent hierarchy.

### Examples

| Collection value | Meaning |
|-----------------|---------|
| `""` (empty) | Article is at the root (uncategorized) |
| `engineering` | Top-level "engineering" collection |
| `engineering/backend` | "backend" nested under "engineering" |
| `engineering/backend/api-design` | Three levels deep |

### Behavior

- Collections are created implicitly when an article uses a new collection path
- To list available collections, implementations SHOULD return distinct collection paths from existing articles
- Searching with `collection: "engineering"` MUST match articles in `engineering`, `engineering/backend`, `engineering/backend/api-design`, etc. (prefix match)
- Implementations MUST support at least 10 levels of nesting
- Collection paths MUST NOT exceed 512 characters in length
- Collection paths MUST NOT contain leading or trailing slashes
- Collection paths MUST be case-sensitive
- Valid characters: alphanumeric, hyphens, underscores, slashes

### Listing Collections

The `list` operation (Section 7.4) with no filters returns articles. To discover collections, implementations SHOULD support a `collections_only: true` parameter that returns distinct collection paths instead of articles.

### Backward Compatibility

The v0.1 `namespace` field is treated as a single-segment collection path. An article with `namespace: "engineering"` is equivalent to `collection: "engineering"`.

---

# PART III: EPISODIC MEMORY

## 9. Episodic Memory

Episodic memory captures what an agent experienced — situation/outcome pairs from interactions. Unlike articles (curated, long-lived), episodes are experiential and decay over time.

### Episode Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | UUID v4 identifier |
| `situation` | string | yes | — | What happened (max 1000 chars) |
| `outcome` | string | yes | — | What resulted (max 1000 chars) |
| `reflection` | string | no | — | What was learned (max 500 chars) |
| `intent` | string | no | — | What the agent was trying to do |
| `tags` | string[] | no | `[]` | Categorization labels |
| `success` | boolean | no | `true` | Whether the outcome was successful |
| `confidence` | number | no | `0.7` | 0.0–1.0 confidence score |
| `project_id` | string | no | — | Project this memory belongs to |
| `article_id` | string | no | — | Related wiki article |
| `conversation_id` | string | no | — | Conversation that produced this memory |
| `task_id` | string | no | — | Task that produced this memory |
| `created_at` | string | yes | — | ISO 8601 timestamp |
| `created_by` | string | no | — | Agent or user identifier |
| `expires_at` | string | no | +90 days | ISO 8601 expiration timestamp |
| `access_count` | integer | no | `0` | Times this memory was retrieved |
| `updated_at` | string | yes | — | ISO 8601 timestamp, updated on TTL extension or edit |

### Lifecycle

Episodes have a **time-to-live** (TTL) based lifecycle, not a feedback-driven one like articles.

- Default TTL: 90 days from creation
- Implementations SHOULD delete expired episodes on a regular cadence
- **TTL extension on access:** When an episode is retrieved via search within 7 days of its `expires_at`, the TTL SHOULD be extended by 30 days. This keeps frequently-used memories alive.
- Implementations MAY allow users to "pin" an episode (set `expires_at: null`) to prevent expiry

### Episode Operations

#### 9.1 memory_store

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `situation` | yes | What happened |
| `outcome` | yes | What resulted |
| `reflection` | no | What was learned |
| `intent` | no | What the agent was trying to do |
| `tags` | no | Tag array |
| `success` | no | Boolean (default true) |
| `confidence` | no | 0.0–1.0 (default 0.7) |
| `project_id` | no | Project ID |
| `article_id` | no | Related wiki article UUID |
| `conversation_id` | no | Source conversation ID |
| `task_id` | no | Source task ID |

**Output:** The full episode object.

#### 9.2 memory_search

Search and list episodic memories. When called with a `query`, performs search. When called without a `query`, returns recent episodes (equivalent to a list operation).

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `query` | no | Search text. If omitted, returns recent episodes. |
| `project_id` | no | Filter by project |
| `tags` | no | Filter by tags |
| `success` | no | Filter by success/failure |
| `since` | no | ISO 8601 timestamp — only episodes created after this time |
| `before` | no | ISO 8601 timestamp — only episodes created before this time |
| `limit` | no | Max results (default 10, max 50) |
| `cursor` | no | Pagination cursor |

**Behavior:**
- With `query`: search by keyword or semantic similarity across `situation`, `outcome`, and `reflection` fields. Increment `access_count` for returned episodes.
- Without `query`: return episodes sorted by `created_at` descending.

**Output:** Array of episodes (with relevance scores when searching), plus `next_cursor`.

#### 9.3 memory_delete

**Input:** `id` (required)

**Output:** `{ "deleted": true }` or error.

---

# PART IV: ASSETS

## 10. Assets

Assets are files — images, documents, audio, video, PDFs — managed by the knowledge system. Assets have a **zone** that determines their lifecycle and a **path** for user organization within that zone.

### Asset Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | yes | — | UUID v4 identifier |
| `name` | string | yes | — | File name (e.g., `hero-banner.png`) |
| `zone` | enum | yes | — | `"permanent"` or `"staging"` |
| `path` | string | no | `""` | Directory path within the zone (e.g., `uploads`, `generated`, `brand/logos`) |
| `mime_type` | string | yes | — | MIME type (e.g., `image/png`) |
| `size_bytes` | integer | yes | — | File size in bytes |
| `source` | enum | no | `"upload"` | `"upload"` or `"generated"` |
| `project_id` | string | no | — | Project this asset belongs to |
| `article_id` | string | no | — | Wiki article this asset belongs to |
| `episode_id` | string | no | — | Episode this asset belongs to |
| `conversation_id` | string | no | — | Conversation that produced this asset |
| `task_id` | string | no | — | Task that produced this asset |
| `created_at` | string | yes | — | ISO 8601 timestamp |
| `created_by` | string | no | — | Agent or user identifier |
| `updated_at` | string | yes | — | ISO 8601 timestamp, updated on zone change or metadata edit |

### Lifecycle Zones

| Zone | Auto-delete | Description |
|------|-------------|-------------|
| `permanent` | Never | User uploads and pinned content. Only deleted explicitly by the user. |
| `staging` | FIFO when quota exceeded | Agent-generated content. Oldest files rotated out when storage quota fills. |

### Default Paths

Implementations SHOULD use these default paths when none is specified:

| Source | Zone | Default Path |
|--------|------|-------------|
| User upload | `permanent` | `uploads` |
| Agent generated | `staging` | `generated` |

### Pinning

To pin a staging asset (prevent auto-deletion), update its `zone` from `staging` to `permanent`. This is called **pinning**. The asset's `path` may optionally be changed at the same time.

### Storage Quotas

Implementations SHOULD enforce per-user storage quotas. When the `staging` zone exceeds its quota, the oldest files (by `created_at`) MUST be deleted first (FIFO). **FIFO rotation MUST skip assets with active `article_id` or `episode_id` references** — only unreferenced staging assets are eligible for automatic deletion. The `permanent` zone SHOULD have a separate, larger quota — when exceeded, new uploads are rejected with `QUOTA_EXCEEDED`.

### Asset Operations

#### 10.1 asset_upload

Create a new asset or update an existing one (for pinning/moving).

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes (create) | File name |
| `content` | yes (create) | Base64-encoded file content OR URL to fetch |
| `id` | no | If provided and exists, updates `zone`/`path` only (pinning). No re-upload needed. |
| `zone` | no | `"permanent"` or `"staging"` (default: `"permanent"` for uploads, `"staging"` for generated) |
| `path` | no | Directory path within zone |
| `mime_type` | no | MIME type (auto-detected if omitted) |
| `source` | no | `"upload"` or `"generated"` (default: `"upload"`) |
| `project_id` | no | Project ID |
| `article_id` | no | Link to wiki article |
| `episode_id` | no | Link to episode |
| `conversation_id` | no | Link to conversation |
| `task_id` | no | Link to task |

**Behavior:**
- On create (`id` not provided or not found): store file content, generate UUID, compute `size_bytes`, set `created_at` and `updated_at`
- On update (`id` provided and exists): update `zone` and/or `path` only. `name` and `content` are ignored. Sets `updated_at`. This is the **pinning** mechanism — move a staging asset to permanent by setting `zone: "permanent"`.

**Output:** The full asset object with `id`, `size_bytes`, and resolved `zone`/`path`.

#### 10.2 asset_get

Retrieve a single asset by ID.

**Input:** `id` (required)

**Output:** Full asset metadata plus file content. Implementations SHOULD return a signed download URL for cloud storage, or base64-encoded content for local storage.

```json
{
  "id": "...",
  "name": "arch-diagram.png",
  "zone": "permanent",
  "path": "uploads",
  "mime_type": "image/png",
  "size_bytes": 45230,
  "download_url": "https://storage.example.com/signed/...",
  "created_at": "2026-03-24T10:00:00Z",
  "updated_at": "2026-03-24T10:00:00Z"
}
```

#### 10.3 asset_list

**Input:**

| Field | Required | Description |
|-------|----------|-------------|
| `zone` | no | Filter by zone (`"permanent"` or `"staging"`) |
| `path` | no | Filter by exact directory path within zone |
| `path_prefix` | no | Filter by path prefix (e.g., `brand/` matches `brand/logos`) |
| `project_id` | no | Filter by project |
| `article_id` | no | Filter by linked article |
| `conversation_id` | no | Filter by linked conversation |
| `task_id` | no | Filter by linked task |
| `mime_type` | no | Filter by MIME type prefix (e.g., `image/`) |
| `limit` | no | Max results (default 20, max 50) |
| `cursor` | no | Pagination cursor |

**Output:** Array of asset metadata (no file content), plus `next_cursor`.

#### 10.4 asset_delete

**Input:** `id` (required)

**Output:** `{ "deleted": true }` or error.

---

# PART V: CROSS-CUTTING CONCERNS

## 11. Scoping

| Scope | Visibility |
|-------|-----------|
| `private` | Only the creating principal |
| `team` | All principals in the same workspace |
| `global` | All principals on the platform |

Scoping applies to articles. Episodes and assets are always scoped to the owning principal (private).

Implementations MUST support at least `private` scope. Multi-tenant implementations SHOULD support all three.

## 12. Versioning

Each article write operation increments `version` by 1. Previous versions are stored in a ring buffer with a configurable maximum (default: 5, implementations MAY support higher values for audit requirements).

Each version snapshot contains:
- `version` (integer)
- `title` (string)
- `content` (string)
- `updated_by` (string)
- `updated_at` (ISO 8601)
- `change_summary` (string)

Episodes and assets are not versioned.

## 13. Pagination

All list and search operations that return arrays MUST support cursor-based pagination.

**Request parameters:**
- `limit` — maximum items to return (implementation defines default and max)
- `cursor` — opaque string from a previous response's `next_cursor`

**Response shape:**

```json
{
  "items": [...],
  "next_cursor": "eyJ..." | null
}
```

When `next_cursor` is `null`, there are no more results. Cursor values are opaque — clients MUST NOT parse or construct them.

## 14. Error Handling

Implementations MUST return structured errors:

| Code | Name | When |
|------|------|------|
| 400 | `INVALID_TYPE` | Unknown article type |
| 400 | `INVALID_MATURITY` | Unknown maturity level |
| 400 | `INVALID_ZONE` | Asset zone is not `permanent` or `staging` |
| 400 | `INVALID_PATH` | Collection path exceeds max depth (10) or max length (512 chars) |
| 400 | `VALIDATION_ERROR` | Missing required fields or invalid values |
| 403 | `SCOPE_VIOLATION` | Principal lacks access to the requested scope |
| 404 | `NOT_FOUND` | Article, episode, or asset does not exist |
| 409 | `CONFLICT` | Duplicate ID on create, or concurrent write conflict |
| 413 | `QUOTA_EXCEEDED` | Storage quota exceeded |
| 500 | `STORAGE_ERROR` | Backend failure |

Error response shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Article not found: d7f3a2b1-..."
  }
}
```

## 15. MCP Transport Binding

AKP operations map to MCP tools. The tool prefix `akp_` is reserved for this protocol.

### Article Tools (Core — MUST implement)

| Operation | MCP Tool Name |
|-----------|---------------|
| write | `akp_write` |
| search | `akp_search` |
| read | `akp_read` |
| list | `akp_list` |
| feedback | `akp_feedback` |

### Memory Tools (Extended — SHOULD implement)

| Operation | MCP Tool Name |
|-----------|---------------|
| memory_store | `akp_memory_store` |
| memory_search | `akp_memory_search` |
| memory_delete | `akp_memory_delete` |

### Asset Tools (Extended — SHOULD implement)

| Operation | MCP Tool Name |
|-----------|---------------|
| asset_upload | `akp_asset_upload` |
| asset_get | `akp_asset_get` |
| asset_list | `akp_asset_list` |
| asset_delete | `akp_asset_delete` |

**Total: 12 MCP tools** (5 core + 3 memory + 4 asset).

Tool schemas are defined in Appendix A.

## 16. Extension Points

Implementations MAY extend AKP in the following ways:

- **Custom article types:** Prefix with `x-` (e.g., `x-meeting-notes`, `x-alert`)
- **Custom metadata fields:** Prefix with `x_` in frontmatter (e.g., `x_severity: critical`)
- **Typed relationships** (planned v1.1): The `related` field may evolve to support typed, directional relations (`supersedes`, `contradicts`, `depends-on`, `part-of`, `see-also`)
- **Temporal validity** (planned v1.1): `valid_from` / `valid_until` for time-bounded knowledge
- **Auto-extraction hooks** (planned v1.1): Server-side extraction of articles/episodes from conversation transcripts
- **Structured conditions** (planned v1.2): Applicability predicates for context-dependent knowledge

---

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
      "project_id": { "type": "string", "description": "Project ID (null = general knowledge)" },
      "collection": { "type": "string", "description": "Collection path (e.g., engineering/backend)" },
      "scope": { "type": "string", "enum": ["private", "team", "global"] },
      "related": { "type": "array", "items": { "type": "string" }, "description": "Related article IDs" },
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
  "description": "Search knowledge articles. Omit query to list by recency.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search text (omit to list by recency)" },
      "type": { "type": "string", "enum": ["fact", "procedure", "decision", "reference", "playbook", "anti-pattern"] },
      "project_id": { "type": "string", "description": "Filter by project (omit = all projects)" },
      "collection": { "type": "string", "description": "Filter by collection path (prefix match)" },
      "maturity": { "type": "string", "enum": ["draft", "candidate", "established", "proven", "deprecated"] },
      "tags": { "type": "array", "items": { "type": "string" } },
      "include_deprecated": { "type": "boolean", "description": "Include deprecated articles (default false)" },
      "limit": { "type": "number" },
      "cursor": { "type": "string" }
    }
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
  "description": "List knowledge articles with filters. Set collections_only: true to list available collections instead.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "enum": ["fact", "procedure", "decision", "reference", "playbook", "anti-pattern"] },
      "project_id": { "type": "string", "description": "Filter by project" },
      "collection": { "type": "string", "description": "Filter by collection path (prefix match)" },
      "maturity": { "type": "string", "enum": ["draft", "candidate", "established", "proven", "deprecated"] },
      "tags": { "type": "array", "items": { "type": "string" } },
      "collections_only": { "type": "boolean", "description": "Return distinct collection paths instead of articles" },
      "include_deprecated": { "type": "boolean", "description": "Include deprecated articles (default false)" },
      "limit": { "type": "number" },
      "cursor": { "type": "string" }
    }
  }
}
```

### akp_feedback

```json
{
  "name": "akp_feedback",
  "description": "Report whether knowledge was helpful or harmful. Drives the maturity lifecycle.",
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

### akp_memory_store

```json
{
  "name": "akp_memory_store",
  "description": "Store an episodic memory from an agent interaction",
  "inputSchema": {
    "type": "object",
    "properties": {
      "situation": { "type": "string", "description": "What happened" },
      "outcome": { "type": "string", "description": "What resulted" },
      "reflection": { "type": "string", "description": "What was learned" },
      "intent": { "type": "string", "description": "What the agent was trying to do" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "success": { "type": "boolean", "description": "Whether the outcome was successful" },
      "confidence": { "type": "number", "description": "0.0-1.0 confidence score" },
      "project_id": { "type": "string", "description": "Project ID" },
      "article_id": { "type": "string", "description": "Related wiki article UUID" },
      "conversation_id": { "type": "string", "description": "Source conversation ID" },
      "task_id": { "type": "string", "description": "Source task ID" }
    },
    "required": ["situation", "outcome"]
  }
}
```

### akp_memory_search

```json
{
  "name": "akp_memory_search",
  "description": "Search episodic memories by query. Omit query to list recent memories.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search text (omit to list recent)" },
      "project_id": { "type": "string", "description": "Filter by project" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "success": { "type": "boolean", "description": "Filter by success/failure" },
      "since": { "type": "string", "description": "ISO 8601 — only episodes after this time" },
      "before": { "type": "string", "description": "ISO 8601 — only episodes before this time" },
      "limit": { "type": "number", "description": "Max results (default 10)" },
      "cursor": { "type": "string" }
    }
  }
}
```

### akp_memory_delete

```json
{
  "name": "akp_memory_delete",
  "description": "Delete an episodic memory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" }
    },
    "required": ["id"]
  }
}
```

### akp_asset_upload

```json
{
  "name": "akp_asset_upload",
  "description": "Upload a file or update an existing asset (pin/move). Provide id to update zone/path only.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "File name (required for new upload)" },
      "content": { "type": "string", "description": "Base64-encoded file content or URL (required for new upload)" },
      "id": { "type": "string", "description": "Existing asset ID — updates zone/path only (pinning)" },
      "zone": { "type": "string", "enum": ["permanent", "staging"], "description": "Lifecycle zone" },
      "path": { "type": "string", "description": "Directory path within zone" },
      "mime_type": { "type": "string", "description": "MIME type (auto-detected if omitted)" },
      "source": { "type": "string", "enum": ["upload", "generated"] },
      "project_id": { "type": "string", "description": "Project ID" },
      "article_id": { "type": "string", "description": "Link to wiki article" },
      "episode_id": { "type": "string", "description": "Link to episode" },
      "conversation_id": { "type": "string", "description": "Link to conversation" },
      "task_id": { "type": "string", "description": "Link to task" }
    }
  }
}
```

### akp_asset_get

```json
{
  "name": "akp_asset_get",
  "description": "Get an asset by ID. Returns metadata and download URL or base64 content.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Asset UUID" }
    },
    "required": ["id"]
  }
}
```

### akp_asset_list

```json
{
  "name": "akp_asset_list",
  "description": "List files in the knowledge asset store",
  "inputSchema": {
    "type": "object",
    "properties": {
      "zone": { "type": "string", "enum": ["permanent", "staging"] },
      "path": { "type": "string", "description": "Filter by exact directory path" },
      "path_prefix": { "type": "string", "description": "Filter by path prefix" },
      "project_id": { "type": "string", "description": "Filter by project" },
      "article_id": { "type": "string", "description": "Filter by linked article" },
      "conversation_id": { "type": "string", "description": "Filter by linked conversation" },
      "task_id": { "type": "string", "description": "Filter by linked task" },
      "mime_type": { "type": "string", "description": "Filter by MIME type prefix (e.g., image/)" },
      "limit": { "type": "number" },
      "cursor": { "type": "string" }
    }
  }
}
```

### akp_asset_delete

```json
{
  "name": "akp_asset_delete",
  "description": "Delete a file from the asset store",
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" }
    },
    "required": ["id"]
  }
}
```

---

## Appendix B: Entity Relationship Summary

```
Project (external, optional)
  └── Collection (path string, implicit)
        └── Article (6 types, maturity lifecycle, versioned)
              ├── related → other Articles (by ID)
              └── assets → linked files (via asset.article_id)

Episode (TTL-based, experiential)
  ├── project_id → Project
  ├── article_id → Article
  ├── conversation_id → external
  └── task_id → external

Asset (file, zone + path, lifecycle managed)
  ├── project_id → Project
  ├── article_id → Article
  ├── episode_id → Episode
  ├── conversation_id → external
  └── task_id → external
```

External references (`project_id`, `conversation_id`, `task_id`) point to entities managed outside AKP. These are opaque strings — AKP does not define their format or lifecycle.

## Appendix C: Migration from v0.1

| v0.1 Field | v1.0 Equivalent | Migration |
|------------|-----------------|-----------|
| `akp: "0.1"` | `akp: "1.0"` | Update version string |
| `namespace: "foo"` | `collection: "foo"` | Rename field |
| `related: ["id1"]` | `related: ["id1"]` | No change (same format) |

Implementations SHOULD accept v0.1 documents and auto-migrate on read.
