#!/usr/bin/env node

/**
 * AKP MCP Server — Agent Knowledge Platform
 *
 * Dual mode:
 *   - HEXACLAW_API_KEY set → cloud mode (semantic search, team sharing, persistent)
 *   - No API key → local mode (SQLite, keyword search, offline)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb, createArticle, getArticle, updateArticle, listArticles, searchArticles, recordFeedback } from "./db.js";
import { isCloudMode, getMode, cloudWrite, cloudSearch, cloudRead, cloudList, cloudFeedback } from "./cloud.js";
import { ARTICLE_TYPES, MATURITY_LEVELS, SCOPES, FEEDBACK_OUTCOMES } from "./types.js";

const server = new McpServer({
  name: "akp",
  version: "0.1.0",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatArticle(a: any): string {
  const lines = [
    `# ${a.title}`,
    `**ID:** ${a.id}`,
    `**Type:** ${a.type} | **Maturity:** ${a.maturity} | **Version:** ${a.version}`,
    `**Tags:** ${(Array.isArray(a.tags) ? a.tags : []).join(", ") || "none"}`,
    `**Namespace:** ${a.namespace || "default"} | **Scope:** ${a.scope || "private"}`,
    `**Confidence:** ${a.confidence ?? 0.7} | **Helpful:** ${a.helpful_count ?? 0} | **Harmful:** ${a.harmful_count ?? 0}`,
    a.expires_at ? `**Expires:** ${a.expires_at}` : null,
    a.created_at ? `**Created:** ${a.created_at}` : null,
    ``,
    a.content,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatCloudArticles(data: any): string {
  const articles = data.articles || data || [];
  if (!Array.isArray(articles) || articles.length === 0) return "No articles found.";
  return articles.map((a: any, i: number) => {
    const score = a.score ? ` (score: ${Number(a.score).toFixed(2)})` : "";
    return `${i + 1}. **${a.title}**${score}\n   ID: ${a.id} | Type: ${a.type} | Maturity: ${a.maturity} | v${a.version}\n   Tags: ${(a.tags || []).join(", ") || "none"}`;
  }).join("\n\n");
}

function txt(text: string) { return { content: [{ type: "text" as const, text }] }; }
function err(text: string) { return { content: [{ type: "text" as const, text }], isError: true }; }

// ── akp_write ─────────────────────────────────────────────────────────────────

const modeLabel = () => isCloudMode() ? "cloud — semantic search, team sharing" : "local — SQLite, offline";

server.tool(
  "akp_write",
  `Create or update a knowledge article. Types: fact, procedure, decision, reference, playbook, anti-pattern. Mode: auto-detects cloud (HEXACLAW_API_KEY) or local (SQLite).`,
  {
    title: z.string().describe("Article title"),
    content: z.string().describe("Markdown content"),
    type: z.enum(ARTICLE_TYPES as any).describe("Article type"),
    id: z.string().optional().describe("Existing article ID to update"),
    summary: z.string().optional().describe("Short summary (max 300 chars)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    namespace: z.string().optional().describe("Logical namespace (default: 'default')"),
    scope: z.enum(SCOPES as any).optional().describe("Visibility scope (cloud: private/team/global, local: private only)"),
    related: z.array(z.string()).optional().describe("Related article IDs"),
    expires_at: z.string().optional().describe("ISO 8601 expiration timestamp"),
    change_summary: z.string().optional().describe("Required when updating an existing article"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudWrite(params as any);
        return txt(formatArticle(data));
      }
      // Local mode
      if (params.id) {
        const existing = getArticle(params.id);
        if (existing) {
          const updated = updateArticle(params.id, {
            title: params.title,
            content: params.content,
            summary: params.summary,
            tags: params.tags,
            namespace: params.namespace,
            scope: params.scope as any,
            related: params.related,
            expires_at: params.expires_at,
            change_summary: params.change_summary || "Updated via AKP",
          });
          return txt(updated ? formatArticle(updated) : "Article not found");
        }
      }
      const article = createArticle({
        title: params.title,
        content: params.content,
        type: params.type as any,
        summary: params.summary,
        tags: params.tags,
        namespace: params.namespace,
        scope: params.scope as any,
        related: params.related,
        expires_at: params.expires_at,
      });
      return txt(formatArticle(article));
    } catch (e: any) {
      return err(`akp_write failed: ${e.message}`);
    }
  }
);

// ── akp_search ────────────────────────────────────────────────────────────────

server.tool(
  "akp_search",
  `Search knowledge articles by query. Cloud mode: semantic search via embeddings. Local mode: keyword matching.`,
  {
    query: z.string().describe("Search query text"),
    type: z.enum(ARTICLE_TYPES as any).optional().describe("Filter by article type"),
    namespace: z.string().optional().describe("Filter by namespace"),
    maturity: z.enum(MATURITY_LEVELS as any).optional().describe("Filter by maturity level"),
    scope: z.enum(["private", "team", "global", "all"] as const).optional().describe("Search scope (cloud only)"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z.number().optional().describe("Max results (default 5, max 20)"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudSearch(params as any);
        const articles = data.articles || [];
        if (articles.length === 0) return txt("No articles found matching your query.");
        const count = data.count || articles.length;
        const credits = data.credits_charged != null ? ` (${data.credits_charged} credit)` : "";
        return txt(`Found ${count} articles${credits}:\n\n${formatCloudArticles(data)}`);
      }
      // Local
      const results = searchArticles(params.query, {
        type: params.type as any,
        namespace: params.namespace,
        maturity: params.maturity as any,
        tags: params.tags,
        limit: params.limit,
      });
      if (results.length === 0) return txt("No articles found matching your query.");
      const text = results.map((r, i) =>
        `${i + 1}. **${r.title}** (score: ${r.score.toFixed(1)})\n   ID: ${r.id} | Type: ${r.type} | Maturity: ${r.maturity}\n   ${r.summary || r.content.substring(0, 150)}...`
      ).join("\n\n");
      return txt(`Found ${results.length} articles:\n\n${text}`);
    } catch (e: any) {
      return err(`akp_search failed: ${e.message}`);
    }
  }
);

// ── akp_read ──────────────────────────────────────────────────────────────────

server.tool(
  "akp_read",
  "Get a knowledge article by ID. Returns full content, metadata, and version history.",
  {
    id: z.string().describe("Article UUID"),
  },
  async ({ id }) => {
    try {
      if (isCloudMode()) {
        const data = await cloudRead(id);
        return txt(formatArticle(data));
      }
      const article = getArticle(id);
      if (!article) return err(`Article not found: ${id}`);
      return txt(formatArticle(article));
    } catch (e: any) {
      return err(`akp_read failed: ${e.message}`);
    }
  }
);

// ── akp_list ──────────────────────────────────────────────────────────────────

server.tool(
  "akp_list",
  "List knowledge articles with optional filters. Returns summaries without full content.",
  {
    type: z.enum(ARTICLE_TYPES as any).optional().describe("Filter by article type"),
    namespace: z.string().optional().describe("Filter by namespace"),
    maturity: z.enum(MATURITY_LEVELS as any).optional().describe("Filter by maturity level"),
    scope: z.enum(["private", "team", "global"] as const).optional().describe("Scope filter"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z.number().optional().describe("Max results (default 20, max 50)"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudList({
          type: params.type,
          namespace: params.namespace,
          maturity: params.maturity,
          scope: params.scope,
          tags: params.tags?.join(","),
          limit: params.limit,
        });
        const articles = data.articles || [];
        if (articles.length === 0) return txt("No articles found.");
        return txt(`${articles.length} articles:\n\n${formatCloudArticles(data)}`);
      }
      // Local
      const articles = listArticles({
        type: params.type as any,
        namespace: params.namespace,
        maturity: params.maturity as any,
        scope: params.scope as any,
        tags: params.tags,
        limit: params.limit,
      });
      if (articles.length === 0) return txt("No articles found.");
      const text = articles.map((a, i) =>
        `${i + 1}. **${a.title}**\n   ID: ${a.id} | Type: ${a.type} | Maturity: ${a.maturity} | v${a.version}\n   Tags: ${a.tags.join(", ") || "none"}`
      ).join("\n\n");
      return txt(`${articles.length} articles:\n\n${text}`);
    } catch (e: any) {
      return err(`akp_list failed: ${e.message}`);
    }
  }
);

// ── akp_feedback ──────────────────────────────────────────────────────────────

server.tool(
  "akp_feedback",
  "Report whether a knowledge article was helpful or harmful. Drives the maturity lifecycle — articles auto-promote with positive feedback and auto-deprecate with negative.",
  {
    id: z.string().describe("Article UUID"),
    outcome: z.enum(FEEDBACK_OUTCOMES as any).describe("Was this knowledge helpful, harmful, or neutral?"),
  },
  async ({ id, outcome }) => {
    try {
      if (isCloudMode()) {
        const data = await cloudFeedback(id, outcome);
        const changed = data.maturity_changed ? " (CHANGED)" : "";
        return txt(`Feedback recorded: **${data.outcome || outcome}**\nHelpful: ${data.helpful_count} | Harmful: ${data.harmful_count}\nMaturity: ${data.maturity}${changed}`);
      }
      const result = recordFeedback(id, outcome as any);
      if (!result) return err(`Article not found: ${id}`);
      return txt(`Feedback recorded: **${result.outcome}**\nHelpful: ${result.helpful_count} | Harmful: ${result.harmful_count}\nMaturity: ${result.maturity}${result.maturity_changed ? " (CHANGED)" : ""}`);
    } catch (e: any) {
      return err(`akp_feedback failed: ${e.message}`);
    }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!isCloudMode()) {
    await initDb();
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`AKP server running — mode: ${getMode()}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
