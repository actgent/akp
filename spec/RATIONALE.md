# AKP (Agent Knowledge Platform) Design Rationale

## Why These 6 Article Types

We surveyed how engineering teams organize knowledge in practice:

- **Facts** — atomic truths that agents need to recall ("Python 3.12 supports free-threading")
- **Procedures** — step-by-step how-tos ("How to deploy to production")
- **Decisions** — recorded choices with context, modeled after Architecture Decision Records (ADRs)
- **References** — lookup tables and configuration docs
- **Playbooks** — incident response and operational runbooks
- **Anti-patterns** — what NOT to do and why — the most underserved category in existing systems

No existing agent memory platform (Mem0, Zep, Letta) offers typed articles. They store flat text memories or knowledge graph nodes. Typed articles enable better search filtering and make knowledge actionable.

## Why Feedback-Driven Maturity

Traditional knowledge bases rely on human curation (wiki gardening). In an agent-first world, knowledge should mature through use — not editorial review.

The maturity lifecycle (draft → candidate → established → proven → deprecated) was inspired by:
- RFC maturity levels (Proposed → Draft → Internet Standard)
- npm package quality signals (downloads, dependents)
- Stack Overflow answer scoring

The thresholds (3/8/20 helpful) were calibrated against our production system.

## What We Deliberately Excluded from v0.1

Based on stress-testing AKP against 20 real-world use cases, we identified 6 systemic gaps. We chose to defer 5 of them to keep v0.1 simple:

| Gap | Why Deferred | Target Version |
|-----|-------------|----------------|
| **Typed relationships** (supersedes, contradicts, depends-on) | Adds schema complexity; `related` field is sufficient for v0.1 | v0.2 |
| **Conflict/contradiction model** | Requires consensus mechanism design; premature without adoption data | v0.2 |
| **Structured applicability conditions** | Key-value predicates add query complexity; tags cover 80% of cases | v0.2 |
| **Authority locking** | Mentioned as MAY in spec; full RBAC model needs enterprise feedback | v0.2 |
| **Media/attachments** | Multimodal embeddings not widely available; text covers most agent knowledge | v0.3 |

We included `expires_at` in v0.1 because temporal knowledge (temporary outages, promotions, time-limited configs) is common and the field is trivial to implement.

## Why an Open Platform Standard, Not Just a Product

The agent knowledge space has no standard. Every platform invents its own schema:
- Mem0: flat memories with tags
- Zep: temporal knowledge graph nodes
- Letta: text blocks with labels
- LangGraph: JSON documents in namespaced stores
- Amazon Bedrock: S3 objects with metadata

By publishing AKP as an open platform standard with a reference implementation, we enable:
1. **Portability** — knowledge can move between platforms
2. **Interoperability** — agents on different platforms can share knowledge
3. **Ecosystem** — third parties can build AKP-compatible tools
4. **Trust** — developers adopt open standards faster than proprietary APIs

The Anthropic playbook validates this: MCP succeeded because the spec is open, not because Claude's implementation is the only one.

---

## v1.0 Additions

### Why Episodic Memory

Articles are curated, long-lived knowledge. But agents also need experiential recall — "last time I deployed on this project, the migration failed because of X." This is a fundamentally different type of information: ephemeral, situation-specific, and decaying.

We modeled episodes as situation/outcome pairs with a 90-day TTL because:
- Situation/outcome maps directly to how agents learn from interactions
- 90 days prevents infinite memory bloat (a common problem with Mem0)
- TTL extension on access keeps frequently-recalled episodes alive naturally
- Linking episodes to articles, conversations, and tasks creates a rich context web

### Why Collections as Path Strings

We considered three approaches for hierarchical organization:
1. **Separate collection entities** with parent_id (like Confluence Spaces)
2. **Path strings** on articles (like filesystems)
3. **Nested tags** (like Notion databases)

We chose path strings because:
- Zero schema overhead — no collection CRUD, no separate table, no tree traversal
- Agents naturally think in paths ("engineering/backend" is intuitive)
- Prefix matching for search is trivial (`LIKE 'engineering/%'`)
- Implicit creation eliminates the "create the folder first" friction

The tradeoff is that collection renaming requires mass-updating articles. We accepted this because renames are rare and the simplicity benefit is large.

### Why project_id

Knowledge needs to be scoped to projects. An agent working on "Project Alpha" should see Alpha's architecture decisions, not every decision ever made. `project_id` is a simple nullable field that enables:
- Project-scoped search (agent automatically filters by active project)
- Dashboard project switcher
- General knowledge (project_id = null) as a fallback

### Why File Assets with Zones

Agents generate images, PDFs, and documents. These need to live somewhere with lifecycle management. We split into two zones:
- **Permanent** — user uploads, never auto-deleted (like S3)
- **Staging** — agent-generated content, FIFO-rotated when quota fills (like a build cache)

This avoids the "infinite storage" problem while keeping important files safe. The pinning mechanism (move staging → permanent) lets users promote generated content.

### Why Typed Relations Were Deferred

Three rounds of board review (Claude Opus, Gemini Pro, GPT-4.1) consistently flagged typed relations as premature for v1.0. The `related` field covers the 80% case. Typed relations (supersedes, contradicts, depends-on) require:
- Graph traversal operations (not defined)
- Consistency enforcement (what happens when A supersedes B but B is proven?)
- UI for visualization

These are v1.1 scope. We ship `related` now and upgrade later.
