#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb, createArticle, getArticle, updateArticle, deleteArticle, listArticles, searchArticles, recordFeedback } from "./db.js";
import { ARTICLE_TYPES, MATURITY_LEVELS, SCOPES, FEEDBACK_OUTCOMES } from "./types.js";

// Create MCP server
const server = new McpServer({
  name: "akp",
  version: "0.1.0",
});

// Helper: format article for display
function formatArticle(article: any): string {
  const lines = [
    `# ${article.title}`,
    `**ID:** ${article.id}`,
    `**Type:** ${article.type} | **Maturity:** ${article.maturity} | **Version:** ${article.version}`,
    `**Tags:** ${article.tags?.join(", ") || "none"}`,
    `**Namespace:** ${article.namespace} | **Scope:** ${article.scope}`,
    `**Confidence:** ${article.confidence} | **Helpful:** ${article.helpful_count} | **Harmful:** ${article.harmful_count}`,
    article.expires_at ? `**Expires:** ${article.expires_at}` : null,
    `**Created:** ${article.created_at} | **Updated:** ${article.updated_at}`,
    ``,
    article.content,
  ].filter(Boolean);
  return lines.join("\n");
}

// --- Tool: akp_write ---
server.tool(
  "akp_write",
  "Create or update a knowledge article. Types: fact, procedure, decision, reference, playbook, anti-pattern. Costs 0 credits (local storage).",
  {
    title: z.string().describe("Article title"),
    content: z.string().describe("Markdown content"),
    type: z.enum(ARTICLE_TYPES as any).describe("Article type"),
    id: z.string().optional().describe("Existing article ID to update"),
    summary: z.string().optional().describe("Short summary (max 300 chars)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    namespace: z.string().optional().describe("Logical namespace (default: 'default')"),
    scope: z.enum(SCOPES as any).optional().describe("Visibility scope"),
    related: z.array(z.string()).optional().describe("Related article IDs"),
    expires_at: z.string().optional().describe("ISO 8601 expiration timestamp"),
    change_summary: z.string().optional().describe("Required when updating an existing article"),
  },
  async (params) => {
    try {
      // Update existing article
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
          return { content: [{ type: "text" as const, text: updated ? formatArticle(updated) : "Article not found" }] };
        }
      }

      // Create new article
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

      return { content: [{ type: "text" as const, text: formatArticle(article) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// --- Tool: akp_search ---
server.tool(
  "akp_search",
  "Search knowledge articles by query. Returns relevant articles ranked by keyword match score.",
  {
    query: z.string().describe("Search query text"),
    type: z.enum(ARTICLE_TYPES as any).optional().describe("Filter by article type"),
    namespace: z.string().optional().describe("Filter by namespace"),
    maturity: z.enum(MATURITY_LEVELS as any).optional().describe("Filter by maturity level"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z.number().optional().describe("Max results (default 5, max 20)"),
  },
  async (params) => {
    try {
      const results = searchArticles(params.query, {
        type: params.type as any,
        namespace: params.namespace,
        maturity: params.maturity as any,
        tags: params.tags,
        limit: params.limit,
      });

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No articles found matching your query." }] };
      }

      const text = results.map((r, i) =>
        `${i + 1}. **${r.title}** (score: ${r.score.toFixed(1)})\n   ID: ${r.id} | Type: ${r.type} | Maturity: ${r.maturity}\n   ${r.summary || r.content.substring(0, 150)}...`
      ).join("\n\n");

      return { content: [{ type: "text" as const, text: `Found ${results.length} articles:\n\n${text}` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// --- Tool: akp_read ---
server.tool(
  "akp_read",
  "Get a knowledge article by ID. Returns full content, metadata, and version history.",
  {
    id: z.string().describe("Article UUID"),
  },
  async (params) => {
    try {
      const article = getArticle(params.id);
      if (!article) {
        return { content: [{ type: "text" as const, text: `Article not found: ${params.id}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: formatArticle(article) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// --- Tool: akp_list ---
server.tool(
  "akp_list",
  "List knowledge articles with optional filters. Returns summaries without full content.",
  {
    type: z.enum(ARTICLE_TYPES as any).optional().describe("Filter by article type"),
    namespace: z.string().optional().describe("Filter by namespace"),
    maturity: z.enum(MATURITY_LEVELS as any).optional().describe("Filter by maturity level"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z.number().optional().describe("Max results (default 20, max 50)"),
  },
  async (params) => {
    try {
      const articles = listArticles({
        type: params.type as any,
        namespace: params.namespace,
        maturity: params.maturity as any,
        tags: params.tags,
        limit: params.limit,
      });

      if (articles.length === 0) {
        return { content: [{ type: "text" as const, text: "No articles found." }] };
      }

      const text = articles.map((a, i) =>
        `${i + 1}. **${a.title}**\n   ID: ${a.id} | Type: ${a.type} | Maturity: ${a.maturity} | v${a.version}\n   Tags: ${a.tags.join(", ") || "none"}`
      ).join("\n\n");

      return { content: [{ type: "text" as const, text: `${articles.length} articles:\n\n${text}` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// --- Tool: akp_feedback ---
server.tool(
  "akp_feedback",
  "Report whether a knowledge article was helpful or harmful. Drives the maturity lifecycle — articles auto-promote with positive feedback and auto-deprecate with negative.",
  {
    id: z.string().describe("Article UUID"),
    outcome: z.enum(FEEDBACK_OUTCOMES as any).describe("Was this knowledge helpful, harmful, or neutral?"),
  },
  async (params) => {
    try {
      const result = recordFeedback(params.id, params.outcome as any);
      if (!result) {
        return { content: [{ type: "text" as const, text: `Article not found: ${params.id}` }], isError: true };
      }

      const text = [
        `Feedback recorded: **${result.outcome}**`,
        `Helpful: ${result.helpful_count} | Harmful: ${result.harmful_count}`,
        `Maturity: ${result.maturity}${result.maturity_changed ? " (CHANGED)" : ""}`,
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// --- Start server ---
async function main() {
  await initDb();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AKP server running (local SQLite at ~/.akp/knowledge.db)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
