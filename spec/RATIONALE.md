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
