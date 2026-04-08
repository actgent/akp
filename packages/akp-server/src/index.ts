#!/usr/bin/env node

/**
 * AKP MCP Server v1.0 — Agent Knowledge Protocol
 *
 * 12 tools for knowledge management, episodic memory, and file assets.
 * Dual mode: local (SQLite) or cloud (HexaClaw API).
 *
 * Articles (5): akp_write, akp_search, akp_read, akp_list, akp_feedback
 * Memory (3): akp_memory_store, akp_memory_search, akp_memory_delete
 * Assets (4): akp_asset_upload, akp_asset_get, akp_asset_list, akp_asset_delete
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  initDb, createArticle, getArticle, updateArticle, listArticles, searchArticles,
  recordFeedback, listCollections, createEpisode, getEpisode, searchEpisodes,
  deleteEpisode, createAsset, getAsset, listAssets, deleteAsset, updateAssetZone,
} from "./db.js";
import {
  isCloudMode, getMode, cloudWrite, cloudSearch, cloudRead, cloudList, cloudFeedback,
  cloudMemoryStore, cloudMemorySearch, cloudMemoryDelete,
  cloudAssetUpload, cloudAssetGet, cloudAssetList, cloudAssetDelete, cloudAssetUpdate,
} from "./cloud.js";
import { ARTICLE_TYPES, MATURITY_LEVELS, SCOPES, FEEDBACK_OUTCOMES } from "./types.js";

const server = new McpServer({
  name: "akp",
  version: "1.0.0",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatArticle(a: any): string {
  const lines = [
    `# ${a.title}`,
    `**ID:** ${a.id}`,
    `**Type:** ${a.type} | **Maturity:** ${a.maturity} | **Version:** ${a.version}`,
    `**Tags:** ${(Array.isArray(a.tags) ? a.tags : []).join(", ") || "none"}`,
    a.collection ? `**Collection:** ${a.collection}` : null,
    a.project_id ? `**Project:** ${a.project_id}` : null,
    `**Scope:** ${a.scope || "private"} | **Confidence:** ${a.confidence ?? 0.7}`,
    `**Helpful:** ${a.helpful_count ?? 0} | **Harmful:** ${a.harmful_count ?? 0}`,
    a.expires_at ? `**Expires:** ${a.expires_at}` : null,
    a.created_at ? `**Created:** ${a.created_at}` : null,
    ``,
    a.content,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatList(data: any): string {
  const articles = data.articles || data || [];
  if (!Array.isArray(articles) || articles.length === 0) return "No articles found.";
  return articles.map((a: any, i: number) => {
    const score = a.score ? ` (score: ${Number(a.score).toFixed(2)})` : "";
    return `${i + 1}. **${a.title}**${score}\n   ID: ${a.id} | Type: ${a.type} | Maturity: ${a.maturity} | v${a.version}\n   Tags: ${(a.tags || []).join(", ") || "none"}${a.collection ? ` | Collection: ${a.collection}` : ""}`;
  }).join("\n\n");
}

function txt(text: string) { return { content: [{ type: "text" as const, text }] }; }
function err(text: string) { return { content: [{ type: "text" as const, text }], isError: true }; }

// ══════════════════════════════════════════════════════════════════════════════
// ARTICLES (5 tools)
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "akp_write",
  `Create or update a knowledge article. Types: fact, procedure, decision, reference, playbook, anti-pattern. Organize with collection paths and project_id.`,
  {
    title: z.string().describe("Article title"),
    content: z.string().describe("Markdown content"),
    type: z.enum(ARTICLE_TYPES as any).describe("Article type"),
    id: z.string().optional().describe("Existing article ID to update"),
    summary: z.string().optional().describe("Short summary (max 300 chars)"),
    tags: z.array(z.string()).optional().describe("Tags for categorization"),
    collection: z.string().optional().describe("Collection path (e.g., engineering/backend)"),
    project_id: z.string().optional().describe("Project ID (null = general knowledge)"),
    scope: z.enum(SCOPES as any).optional().describe("Visibility scope"),
    related: z.array(z.string()).optional().describe("Related article IDs"),
    expires_at: z.string().optional().describe("ISO 8601 expiration"),
    change_summary: z.string().optional().describe("Required when updating"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudWrite(params as any);
        return txt(formatArticle(data));
      }
      if (params.id) {
        const existing = getArticle(params.id);
        if (existing) {
          const updated = updateArticle(params.id, {
            title: params.title,
            content: params.content,
            summary: params.summary,
            tags: params.tags,
            namespace: params.collection,
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
        collection: params.collection,
        project_id: params.project_id,
        namespace: params.collection,
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

server.tool(
  "akp_search",
  `Search knowledge articles. Omit query to list by recency. Supports collection prefix matching and project filtering. Deprecated articles excluded by default.`,
  {
    query: z.string().optional().describe("Search text (omit to list by recency)"),
    type: z.enum(ARTICLE_TYPES as any).optional().describe("Filter by type"),
    collection: z.string().optional().describe("Filter by collection path (prefix match)"),
    project_id: z.string().optional().describe("Filter by project"),
    maturity: z.enum(MATURITY_LEVELS as any).optional().describe("Filter by maturity"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    include_deprecated: z.boolean().optional().describe("Include deprecated articles (default false)"),
    limit: z.number().optional().describe("Max results (default 10)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudSearch(params as any);
        const articles = data.articles || [];
        if (articles.length === 0) return txt("No articles found.");
        return txt(`Found ${articles.length} articles:\n\n${formatList(data)}`);
      }
      const results = searchArticles(params.query || "", {
        type: params.type as any,
        collection: params.collection,
        maturity: params.maturity as any,
        tags: params.tags,
        include_deprecated: params.include_deprecated,
        limit: params.limit,
      });
      if (results.length === 0) return txt("No articles found.");
      return txt(`Found ${results.length} articles:\n\n${results.map((r, i) =>
        `${i + 1}. **${r.title}** (score: ${r.score.toFixed(1)})\n   ID: ${r.id} | Type: ${r.type} | Maturity: ${r.maturity}${r.collection ? ` | Collection: ${r.collection}` : ""}\n   ${r.summary || r.content.substring(0, 150)}...`
      ).join("\n\n")}`);
    } catch (e: any) {
      return err(`akp_search failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_read",
  "Get a knowledge article by ID. Returns full content, metadata, and version history.",
  { id: z.string().describe("Article UUID") },
  async ({ id }) => {
    try {
      if (isCloudMode()) return txt(formatArticle(await cloudRead(id)));
      const article = getArticle(id);
      if (!article) return err(`Article not found: ${id}`);
      return txt(formatArticle(article));
    } catch (e: any) {
      return err(`akp_read failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_list",
  "List knowledge articles with filters. Set collections_only: true to list available collection paths instead.",
  {
    type: z.enum(ARTICLE_TYPES as any).optional().describe("Filter by type"),
    collection: z.string().optional().describe("Filter by collection path (prefix match)"),
    project_id: z.string().optional().describe("Filter by project"),
    maturity: z.enum(MATURITY_LEVELS as any).optional().describe("Filter by maturity"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    collections_only: z.boolean().optional().describe("Return distinct collection paths"),
    include_deprecated: z.boolean().optional().describe("Include deprecated (default false)"),
    limit: z.number().optional().describe("Max results (default 20)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudList({
          type: params.type,
          collection: params.collection,
          project_id: params.project_id,
          maturity: params.maturity,
          tags: params.tags?.join(","),
          collections_only: params.collections_only,
          include_deprecated: params.include_deprecated,
          limit: params.limit,
          cursor: params.cursor,
        });
        if (params.collections_only) {
          const cols = data.collections || [];
          return txt(cols.length === 0 ? "No collections found." : `Collections:\n${cols.map((c: string) => `  ${c}`).join("\n")}`);
        }
        const articles = data.articles || [];
        if (articles.length === 0) return txt("No articles found.");
        return txt(`${articles.length} articles:\n\n${formatList(data)}`);
      }
      if (params.collections_only) {
        const cols = listCollections();
        return txt(cols.length === 0 ? "No collections found." : `Collections:\n${cols.map(c => `  ${c}`).join("\n")}`);
      }
      const articles = listArticles({
        type: params.type as any,
        collection: params.collection,
        project_id: params.project_id,
        maturity: params.maturity as any,
        tags: params.tags,
        include_deprecated: params.include_deprecated,
        limit: params.limit,
      });
      if (articles.length === 0) return txt("No articles found.");
      return txt(`${articles.length} articles:\n\n${articles.map((a, i) =>
        `${i + 1}. **${a.title}**\n   ID: ${a.id} | Type: ${a.type} | Maturity: ${a.maturity} | v${a.version}${a.collection ? ` | Collection: ${a.collection}` : ""}\n   Tags: ${a.tags.join(", ") || "none"}`
      ).join("\n\n")}`);
    } catch (e: any) {
      return err(`akp_list failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_feedback",
  "Report whether a knowledge article was helpful or harmful. Drives the maturity lifecycle.",
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

// ══════════════════════════════════════════════════════════════════════════════
// MEMORY (3 tools)
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "akp_memory_store",
  "Store an episodic memory — a situation/outcome pair from an agent interaction. Memories expire after 90 days.",
  {
    situation: z.string().describe("What happened"),
    outcome: z.string().describe("What resulted"),
    reflection: z.string().optional().describe("What was learned"),
    intent: z.string().optional().describe("What the agent was trying to do"),
    tags: z.array(z.string()).optional().describe("Tags"),
    success: z.boolean().optional().describe("Successful outcome? (default true)"),
    confidence: z.number().optional().describe("0.0-1.0 (default 0.7)"),
    project_id: z.string().optional().describe("Project ID"),
    article_id: z.string().optional().describe("Related article UUID"),
    conversation_id: z.string().optional().describe("Source conversation"),
    task_id: z.string().optional().describe("Source task"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudMemoryStore(params);
        return txt(JSON.stringify(data, null, 2));
      }
      const ep = createEpisode(params);
      return txt(`Memory stored:\n**Situation:** ${ep.situation}\n**Outcome:** ${ep.outcome}\n**ID:** ${ep.id}\n**Expires:** ${ep.expires_at}`);
    } catch (e: any) {
      return err(`akp_memory_store failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_memory_search",
  "Search episodic memories. Omit query to list recent. Supports temporal filtering.",
  {
    query: z.string().optional().describe("Search text (omit to list recent)"),
    project_id: z.string().optional().describe("Filter by project"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    success: z.boolean().optional().describe("Filter by success/failure"),
    since: z.string().optional().describe("ISO 8601 — only after this time"),
    before: z.string().optional().describe("ISO 8601 — only before this time"),
    limit: z.number().optional().describe("Max results (default 10)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const data = await cloudMemorySearch(params);
        const memories = data.memories || [];
        if (memories.length === 0) return txt("No memories found.");
        return txt(`Found ${memories.length} memories:\n\n${memories.map((m: any, i: number) =>
          `${i + 1}. **${m.situation?.substring(0, 80)}**${m.score ? ` (score: ${m.score.toFixed(2)})` : ""}\n   Outcome: ${m.outcome?.substring(0, 100)}\n   Tags: ${(m.tags || []).join(", ") || "none"}`
        ).join("\n\n")}`);
      }
      const results = searchEpisodes(params.query, {
        tags: params.tags,
        success: params.success,
        since: params.since,
        before: params.before,
        project_id: params.project_id,
        limit: params.limit,
      });
      if (results.length === 0) return txt("No memories found.");
      return txt(`Found ${results.length} memories:\n\n${results.map((m: any, i: number) =>
        `${i + 1}. **${m.situation.substring(0, 80)}**${m.score ? ` (score: ${m.score.toFixed(1)})` : ""}\n   Outcome: ${m.outcome.substring(0, 100)}\n   Tags: ${(m.tags || []).join(", ") || "none"} | Success: ${m.success}`
      ).join("\n\n")}`);
    } catch (e: any) {
      return err(`akp_memory_search failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_memory_delete",
  "Delete an episodic memory.",
  { id: z.string().describe("Episode UUID") },
  async ({ id }) => {
    try {
      if (isCloudMode()) {
        await cloudMemoryDelete(id);
        return txt(`Memory deleted: ${id}`);
      }
      if (!deleteEpisode(id)) return err(`Memory not found: ${id}`);
      return txt(`Memory deleted: ${id}`);
    } catch (e: any) {
      return err(`akp_memory_delete failed: ${e.message}`);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// ASSETS (4 tools)
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "akp_asset_upload",
  "Upload a file or pin an existing asset. Provide id to update zone/path only (pinning).",
  {
    name: z.string().optional().describe("File name (required for new upload)"),
    content: z.string().optional().describe("Base64 content or URL (required for new upload)"),
    id: z.string().optional().describe("Existing asset ID — updates zone/path only"),
    zone: z.enum(["permanent", "staging"]).optional().describe("Lifecycle zone"),
    path: z.string().optional().describe("Directory path within zone"),
    mime_type: z.string().optional().describe("MIME type (auto-detected if omitted)"),
    source: z.enum(["upload", "generated"]).optional().describe("How created"),
    project_id: z.string().optional().describe("Project ID"),
    article_id: z.string().optional().describe("Link to article"),
    episode_id: z.string().optional().describe("Link to episode"),
    conversation_id: z.string().optional().describe("Link to conversation"),
    task_id: z.string().optional().describe("Link to task"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        if (params.id) {
          const data = await cloudAssetUpdate(params.id, { zone: params.zone, path: params.path });
          return txt(`Asset updated: ${JSON.stringify(data, null, 2)}`);
        }
        const data = await cloudAssetUpload(params as any);
        return txt(`Asset uploaded: ${JSON.stringify(data, null, 2)}`);
      }
      if (params.id) {
        const updated = updateAssetZone(params.id, params.zone || "permanent", params.path);
        if (!updated) return err(`Asset not found: ${params.id}`);
        return txt(`Asset pinned: ${updated.name} → ${updated.zone}/${updated.path}`);
      }
      if (!params.name || !params.content) return err("name and content required for new upload");
      const buffer = params.content.startsWith("http")
        ? Buffer.from(await (await fetch(params.content)).arrayBuffer())
        : Buffer.from(params.content, "base64");
      const asset = createAsset({
        name: params.name,
        content: buffer,
        zone: params.zone,
        path: params.path,
        mime_type: params.mime_type,
        source: params.source,
        project_id: params.project_id,
        article_id: params.article_id,
        episode_id: params.episode_id,
        conversation_id: params.conversation_id,
        task_id: params.task_id,
      });
      return txt(`Asset uploaded:\n**Name:** ${asset.name}\n**ID:** ${asset.id}\n**Zone:** ${asset.zone}/${asset.path}\n**Size:** ${asset.size_bytes} bytes`);
    } catch (e: any) {
      return err(`akp_asset_upload failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_asset_get",
  "Get an asset by ID. Returns metadata and content (base64 for local, download URL for cloud).",
  { id: z.string().describe("Asset UUID") },
  async ({ id }) => {
    try {
      if (isCloudMode()) {
        const data = await cloudAssetGet(id);
        return txt(JSON.stringify(data, null, 2));
      }
      const asset = getAsset(id);
      if (!asset) return err(`Asset not found: ${id}`);
      return txt(`**Name:** ${asset.name}\n**Zone:** ${asset.zone}/${asset.path}\n**Type:** ${asset.mime_type}\n**Size:** ${asset.size_bytes} bytes\n**ID:** ${asset.id}\n\nContent (base64): ${asset.content ? asset.content.substring(0, 100) + "..." : "N/A"}`);
    } catch (e: any) {
      return err(`akp_asset_get failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_asset_list",
  "List files in the asset store. Filter by zone, path, project, or linked entity.",
  {
    zone: z.enum(["permanent", "staging"]).optional().describe("Filter by zone"),
    path: z.string().optional().describe("Exact directory path"),
    path_prefix: z.string().optional().describe("Path prefix match"),
    project_id: z.string().optional().describe("Filter by project"),
    article_id: z.string().optional().describe("Filter by linked article"),
    conversation_id: z.string().optional().describe("Filter by conversation"),
    task_id: z.string().optional().describe("Filter by task"),
    mime_type: z.string().optional().describe("MIME type prefix (e.g., image/)"),
    limit: z.number().optional().describe("Max results (default 20)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (params) => {
    try {
      if (isCloudMode()) {
        const qs: Record<string, string> = {};
        if (params.zone) qs.zone = params.zone;
        if (params.path) qs.path = params.path;
        if (params.path_prefix) qs.path_prefix = params.path_prefix;
        if (params.project_id) qs.project_id = params.project_id;
        if (params.article_id) qs.article_id = params.article_id;
        if (params.conversation_id) qs.conversation_id = params.conversation_id;
        if (params.task_id) qs.task_id = params.task_id;
        if (params.mime_type) qs.mime_type = params.mime_type;
        if (params.limit) qs.limit = String(params.limit);
        if (params.cursor) qs.cursor = params.cursor;
        const data = await cloudAssetList(qs);
        const assets = data.assets || [];
        if (assets.length === 0) return txt("No files found.");
        return txt(`${assets.length} files:\n\n${assets.map((a: any, i: number) =>
          `${i + 1}. **${a.name}** (${a.zone}/${a.path})\n   ${a.mime_type} | ${a.size_bytes} bytes | ${a.created_at}`
        ).join("\n\n")}`);
      }
      const assets = listAssets(params);
      if (assets.length === 0) return txt("No files found.");
      return txt(`${assets.length} files:\n\n${assets.map((a: any, i: number) =>
        `${i + 1}. **${a.name}** (${a.zone}/${a.path})\n   ${a.mime_type} | ${a.size_bytes} bytes | ID: ${a.id}`
      ).join("\n\n")}`);
    } catch (e: any) {
      return err(`akp_asset_list failed: ${e.message}`);
    }
  }
);

server.tool(
  "akp_asset_delete",
  "Delete a file from the asset store.",
  { id: z.string().describe("Asset UUID") },
  async ({ id }) => {
    try {
      if (isCloudMode()) {
        await cloudAssetDelete(id);
        return txt(`Asset deleted: ${id}`);
      }
      if (!deleteAsset(id)) return err(`Asset not found: ${id}`);
      return txt(`Asset deleted: ${id}`);
    } catch (e: any) {
      return err(`akp_asset_delete failed: ${e.message}`);
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
  console.error(`AKP server v1.0 running — mode: ${getMode()} — 12 tools`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
