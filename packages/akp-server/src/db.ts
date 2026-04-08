import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { computeMaturity } from "./maturity.js";
import type { Article, ArticleVersion, ArticleType, Maturity, Scope, FeedbackOutcome, SearchResult } from "./types.js";

const MAX_VERSIONS = 5;

let db: SqlJsDatabase;
let dbPath: string;

function save(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
}

export async function initDb(customPath?: string): Promise<void> {
  dbPath = customPath || process.env.AKP_DB_PATH || join(homedir(), ".akp", "knowledge.db");
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT DEFAULT '',
      type TEXT NOT NULL,
      maturity TEXT NOT NULL DEFAULT 'draft',
      tags TEXT DEFAULT '[]',
      namespace TEXT DEFAULT 'default',
      scope TEXT DEFAULT 'private',
      confidence REAL DEFAULT 0.7,
      helpful_count INTEGER DEFAULT 0,
      harmful_count INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      related TEXT DEFAULT '[]',
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS article_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_by TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      change_summary TEXT DEFAULT ''
    )
  `);

  // AKP v1.0: add collection and project_id columns (migration)
  try { db.run("ALTER TABLE articles ADD COLUMN collection TEXT DEFAULT ''"); } catch { /* already exists */ }
  try { db.run("ALTER TABLE articles ADD COLUMN project_id TEXT DEFAULT ''"); } catch { /* already exists */ }
  // Migrate namespace to collection for existing articles
  db.run("UPDATE articles SET collection = namespace WHERE collection = '' AND namespace != 'default' AND namespace != ''");

  // AKP v1.0: Episodes table
  db.run(`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      situation TEXT NOT NULL,
      outcome TEXT NOT NULL,
      reflection TEXT DEFAULT '',
      intent TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      success INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.7,
      project_id TEXT DEFAULT '',
      article_id TEXT DEFAULT '',
      conversation_id TEXT DEFAULT '',
      task_id TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT DEFAULT '',
      expires_at TEXT,
      access_count INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  // AKP v1.0: Assets table
  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zone TEXT NOT NULL DEFAULT 'permanent',
      path TEXT DEFAULT '',
      mime_type TEXT DEFAULT 'application/octet-stream',
      size_bytes INTEGER DEFAULT 0,
      source TEXT DEFAULT 'upload',
      content BLOB,
      project_id TEXT DEFAULT '',
      article_id TEXT DEFAULT '',
      episode_id TEXT DEFAULT '',
      conversation_id TEXT DEFAULT '',
      task_id TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      created_by TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_articles_type ON articles(type)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_namespace ON articles(namespace)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_collection ON articles(collection)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_project ON articles(project_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_maturity ON articles(maturity)");
  db.run("CREATE INDEX IF NOT EXISTS idx_versions_article ON article_versions(article_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_episodes_expires ON episodes(expires_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_assets_zone ON assets(zone)");
  db.run("CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_assets_article ON assets(article_id)");

  save();
}

function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql: string, params: any[] = []): any | null {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function run(sql: string, params: any[] = []): void {
  db.run(sql, params);
}

function rowToArticle(row: any): Article {
  return {
    ...row,
    tags: JSON.parse(row.tags || "[]"),
    related: JSON.parse(row.related || "[]"),
    collection: row.collection || "",
    project_id: row.project_id || null,
    expires_at: row.expires_at || null,
    previous_versions: getVersions(row.id),
  };
}

function getVersions(articleId: string): ArticleVersion[] {
  return queryAll(
    "SELECT version, title, content, updated_by, updated_at, change_summary FROM article_versions WHERE article_id = ? ORDER BY version DESC LIMIT ?",
    [articleId, MAX_VERSIONS]
  );
}

export function createArticle(params: {
  title: string;
  content: string;
  type: ArticleType;
  summary?: string;
  tags?: string[];
  namespace?: string;
  collection?: string;
  project_id?: string;
  scope?: Scope;
  related?: string[];
  expires_at?: string;
  created_by?: string;
}): Article {
  const now = new Date().toISOString();
  const id = randomUUID();
  const summary = params.summary || params.content.substring(0, 200);
  const collection = params.collection || params.namespace || "";

  run(
    `INSERT INTO articles (id, title, content, summary, type, maturity, tags, namespace, collection, project_id, scope, confidence, helpful_count, harmful_count, version, related, created_by, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, 0.7, 0, 0, 1, ?, ?, ?, ?, ?)`,
    [
      id,
      params.title,
      params.content,
      summary,
      params.type,
      JSON.stringify(params.tags || []),
      params.namespace || collection || "default",
      collection,
      params.project_id || "",
      params.scope || "private",
      JSON.stringify(params.related || []),
      params.created_by || "",
      now,
      now,
      params.expires_at || null,
    ]
  );

  save();
  return getArticle(id)!;
}

export function getArticle(id: string): Article | null {
  const row = queryOne("SELECT * FROM articles WHERE id = ?", [id]);
  if (!row) return null;
  return rowToArticle(row);
}

export function updateArticle(
  id: string,
  updates: {
    title?: string;
    content?: string;
    summary?: string;
    tags?: string[];
    namespace?: string;
    scope?: Scope;
    related?: string[];
    expires_at?: string;
    change_summary: string;
    updated_by?: string;
  }
): Article | null {
  const existing = queryOne("SELECT * FROM articles WHERE id = ?", [id]);
  if (!existing) return null;

  // Archive current version
  run(
    `INSERT INTO article_versions (article_id, version, title, content, updated_by, updated_at, change_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, existing.version, existing.title, existing.content, updates.updated_by || "", new Date().toISOString(), updates.change_summary]
  );

  // Trim old versions
  const countResult = queryOne("SELECT COUNT(*) as cnt FROM article_versions WHERE article_id = ?", [id]);
  const versionCount = countResult?.cnt || 0;
  if (versionCount > MAX_VERSIONS) {
    run(
      `DELETE FROM article_versions WHERE article_id = ? AND id IN (
        SELECT id FROM article_versions WHERE article_id = ? ORDER BY version ASC LIMIT ?
      )`,
      [id, id, versionCount - MAX_VERSIONS]
    );
  }

  const now = new Date().toISOString();
  const newVersion = existing.version + 1;

  const setClauses: string[] = ["version = ?", "updated_at = ?"];
  const values: any[] = [newVersion, now];

  if (updates.title !== undefined) { setClauses.push("title = ?"); values.push(updates.title); }
  if (updates.content !== undefined) { setClauses.push("content = ?"); values.push(updates.content); }
  if (updates.summary !== undefined) { setClauses.push("summary = ?"); values.push(updates.summary); }
  if (updates.tags !== undefined) { setClauses.push("tags = ?"); values.push(JSON.stringify(updates.tags)); }
  if (updates.namespace !== undefined) { setClauses.push("namespace = ?"); values.push(updates.namespace); }
  if (updates.scope !== undefined) { setClauses.push("scope = ?"); values.push(updates.scope); }
  if (updates.related !== undefined) { setClauses.push("related = ?"); values.push(JSON.stringify(updates.related)); }
  if (updates.expires_at !== undefined) { setClauses.push("expires_at = ?"); values.push(updates.expires_at); }

  values.push(id);
  run(`UPDATE articles SET ${setClauses.join(", ")} WHERE id = ?`, values);

  save();
  return getArticle(id);
}

export function deleteArticle(id: string): boolean {
  const existing = queryOne("SELECT id FROM articles WHERE id = ?", [id]);
  if (!existing) return false;
  run("DELETE FROM article_versions WHERE article_id = ?", [id]);
  run("DELETE FROM articles WHERE id = ?", [id]);
  save();
  return true;
}

export function listArticles(filters: {
  type?: ArticleType;
  namespace?: string;
  collection?: string;
  project_id?: string;
  maturity?: Maturity;
  scope?: Scope;
  tags?: string[];
  include_deprecated?: boolean;
  limit?: number;
}): Article[] {
  const where: string[] = [];
  const params: any[] = [];

  if (filters.type) { where.push("type = ?"); params.push(filters.type); }
  if (filters.collection) { where.push("collection LIKE ?"); params.push(filters.collection + "%"); }
  else if (filters.namespace) { where.push("namespace = ?"); params.push(filters.namespace); }
  if (filters.project_id) { where.push("project_id = ?"); params.push(filters.project_id); }
  if (filters.maturity) { where.push("maturity = ?"); params.push(filters.maturity); }
  if (!filters.include_deprecated) { where.push("maturity != 'deprecated'"); }
  if (filters.scope) { where.push("scope = ?"); params.push(filters.scope); }
  if (filters.tags?.length) {
    for (const tag of filters.tags) {
      where.push("tags LIKE ?");
      params.push(`%"${tag}"%`);
    }
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(filters.limit || 20, 50);
  params.push(limit);

  const rows = queryAll(`SELECT * FROM articles ${whereClause} ORDER BY updated_at DESC LIMIT ?`, params);
  return rows.map(rowToArticle);
}

export function searchArticles(query: string, filters: {
  type?: ArticleType;
  namespace?: string;
  maturity?: Maturity;
  scope?: Scope;
  tags?: string[];
  limit?: number;
}): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return [];

  const articles = listArticles({ ...filters, limit: 200 });

  const scored: SearchResult[] = [];
  for (const article of articles) {
    let score = 0;
    const titleLower = article.title.toLowerCase();
    const contentLower = article.content.toLowerCase();
    const summaryLower = article.summary.toLowerCase();
    const tagsLower = article.tags.join(" ").toLowerCase();

    for (const word of words) {
      if (titleLower.includes(word)) score += 3;
      if (tagsLower.includes(word)) score += 2;
      if (summaryLower.includes(word)) score += 1.5;
      if (contentLower.includes(word)) score += 1;
    }

    if (score > 0) {
      scored.push({ ...article, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(filters.limit || 5, 20));
}

export function recordFeedback(id: string, outcome: FeedbackOutcome): {
  id: string;
  outcome: FeedbackOutcome;
  helpful_count: number;
  harmful_count: number;
  maturity: Maturity;
  maturity_changed: boolean;
} | null {
  const row = queryOne("SELECT * FROM articles WHERE id = ?", [id]);
  if (!row) return null;

  let helpfulCount = row.helpful_count;
  let harmfulCount = row.harmful_count;
  const oldMaturity = row.maturity as Maturity;

  if (outcome === "helpful") helpfulCount++;
  else if (outcome === "harmful") harmfulCount++;

  const newMaturity = computeMaturity(oldMaturity, helpfulCount, harmfulCount);

  run("UPDATE articles SET helpful_count = ?, harmful_count = ?, maturity = ?, updated_at = ? WHERE id = ?",
    [helpfulCount, harmfulCount, newMaturity, new Date().toISOString(), id]);

  save();

  return {
    id,
    outcome,
    helpful_count: helpfulCount,
    harmful_count: harmfulCount,
    maturity: newMaturity,
    maturity_changed: oldMaturity !== newMaturity,
  };
}

// ─── Collections ──────────────────────────────────────────────────────────

export function listCollections(): string[] {
  const rows = queryAll("SELECT DISTINCT collection FROM articles WHERE collection != '' ORDER BY collection");
  return rows.map((r: any) => r.collection as string);
}

// ─── Episodes ─────────────────────────────────────────────────────────────

export function createEpisode(params: {
  situation: string;
  outcome: string;
  reflection?: string;
  intent?: string;
  tags?: string[];
  success?: boolean;
  confidence?: number;
  project_id?: string;
  article_id?: string;
  conversation_id?: string;
  task_id?: string;
}): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  run(
    `INSERT INTO episodes (id, situation, outcome, reflection, intent, tags, success, confidence, project_id, article_id, conversation_id, task_id, created_at, created_by, expires_at, access_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 0, ?)`,
    [
      id, params.situation, params.outcome,
      params.reflection || "", params.intent || "",
      JSON.stringify(params.tags || []),
      params.success !== false ? 1 : 0,
      Math.max(0, Math.min(1, params.confidence ?? 0.7)),
      params.project_id || "", params.article_id || "",
      params.conversation_id || "", params.task_id || "",
      now, expiresAt, now,
    ]
  );
  save();
  return getEpisode(id);
}

export function getEpisode(id: string): any | null {
  const row = queryOne("SELECT * FROM episodes WHERE id = ?", [id]);
  if (!row) return null;
  return { ...row, tags: JSON.parse(row.tags || "[]"), success: !!row.success };
}

export function searchEpisodes(query: string | undefined, filters: {
  tags?: string[];
  success?: boolean;
  since?: string;
  before?: string;
  project_id?: string;
  limit?: number;
}): any[] {
  if (!query) {
    // List by recency
    const where: string[] = [];
    const params: any[] = [];
    if (filters.success !== undefined) { where.push("success = ?"); params.push(filters.success ? 1 : 0); }
    if (filters.project_id) { where.push("project_id = ?"); params.push(filters.project_id); }
    if (filters.since) { where.push("created_at >= ?"); params.push(filters.since); }
    if (filters.before) { where.push("created_at <= ?"); params.push(filters.before); }
    if (filters.tags?.length) {
      for (const tag of filters.tags) {
        where.push("tags LIKE ?"); params.push(`%"${tag}"%`);
      }
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(filters.limit || 10, 50);
    params.push(limit);
    const rows = queryAll(`SELECT * FROM episodes ${whereClause} ORDER BY created_at DESC LIMIT ?`, params);
    return rows.map((r: any) => ({ ...r, tags: JSON.parse(r.tags || "[]"), success: !!r.success, score: 0 }));
  }

  // Keyword search
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return [];

  const all = queryAll("SELECT * FROM episodes ORDER BY created_at DESC LIMIT 200");
  const scored: any[] = [];
  for (const row of all) {
    let score = 0;
    const sitLower = row.situation.toLowerCase();
    const outLower = row.outcome.toLowerCase();
    const refLower = (row.reflection || "").toLowerCase();
    for (const word of words) {
      if (sitLower.includes(word)) score += 3;
      if (outLower.includes(word)) score += 2;
      if (refLower.includes(word)) score += 1;
    }
    if (score > 0) {
      const ep = { ...row, tags: JSON.parse(row.tags || "[]"), success: !!row.success, score };
      // Apply filters
      if (filters.success !== undefined && ep.success !== filters.success) continue;
      if (filters.project_id && row.project_id !== filters.project_id) continue;
      if (filters.since && row.created_at < filters.since) continue;
      if (filters.before && row.created_at > filters.before) continue;
      if (filters.tags?.length && !filters.tags.every(t => ep.tags.includes(t))) continue;
      scored.push(ep);
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(filters.limit || 10, 50));
}

export function deleteEpisode(id: string): boolean {
  const existing = queryOne("SELECT id FROM episodes WHERE id = ?", [id]);
  if (!existing) return false;
  run("DELETE FROM episodes WHERE id = ?", [id]);
  save();
  return true;
}

// ─── Assets ───────────────────────────────────────────────────────────────

export function createAsset(params: {
  name: string;
  content: Buffer;
  zone?: string;
  path?: string;
  mime_type?: string;
  source?: string;
  project_id?: string;
  article_id?: string;
  episode_id?: string;
  conversation_id?: string;
  task_id?: string;
}): any {
  const now = new Date().toISOString();
  const id = randomUUID();
  const zone = params.zone || (params.source === "generated" ? "staging" : "permanent");
  const path = params.path || (params.source === "generated" ? "generated" : "uploads");

  run(
    `INSERT INTO assets (id, name, zone, path, mime_type, size_bytes, source, content, project_id, article_id, episode_id, conversation_id, task_id, created_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)`,
    [
      id, params.name, zone, path,
      params.mime_type || "application/octet-stream",
      params.content.byteLength, params.source || "upload",
      params.content,
      params.project_id || "", params.article_id || "",
      params.episode_id || "", params.conversation_id || "",
      params.task_id || "", now, now,
    ]
  );
  save();
  return getAsset(id);
}

export function getAsset(id: string): any | null {
  const row = queryOne("SELECT * FROM assets WHERE id = ?", [id]);
  if (!row) return null;
  const result = { ...row };
  // Convert content blob to base64 for transport
  if (result.content && Buffer.isBuffer(result.content)) {
    result.content = Buffer.from(result.content).toString("base64");
  } else if (result.content instanceof Uint8Array) {
    result.content = Buffer.from(result.content).toString("base64");
  }
  return result;
}

export function listAssets(filters: {
  zone?: string;
  path?: string;
  path_prefix?: string;
  project_id?: string;
  article_id?: string;
  conversation_id?: string;
  task_id?: string;
  mime_type?: string;
  limit?: number;
}): any[] {
  const where: string[] = [];
  const params: any[] = [];

  if (filters.zone) { where.push("zone = ?"); params.push(filters.zone); }
  if (filters.path) { where.push("path = ?"); params.push(filters.path); }
  if (filters.path_prefix) { where.push("path LIKE ?"); params.push(filters.path_prefix + "%"); }
  if (filters.project_id) { where.push("project_id = ?"); params.push(filters.project_id); }
  if (filters.article_id) { where.push("article_id = ?"); params.push(filters.article_id); }
  if (filters.conversation_id) { where.push("conversation_id = ?"); params.push(filters.conversation_id); }
  if (filters.task_id) { where.push("task_id = ?"); params.push(filters.task_id); }
  if (filters.mime_type) { where.push("mime_type LIKE ?"); params.push(filters.mime_type + "%"); }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(filters.limit || 20, 50);
  params.push(limit);

  // Don't return content blob in list
  const rows = queryAll(
    `SELECT id, name, zone, path, mime_type, size_bytes, source, project_id, article_id, episode_id, conversation_id, task_id, created_at, created_by, updated_at FROM assets ${whereClause} ORDER BY created_at DESC LIMIT ?`,
    params
  );
  return rows;
}

export function deleteAsset(id: string): boolean {
  const existing = queryOne("SELECT id FROM assets WHERE id = ?", [id]);
  if (!existing) return false;
  run("DELETE FROM assets WHERE id = ?", [id]);
  save();
  return true;
}

export function updateAssetZone(id: string, zone: string, path?: string): any | null {
  const existing = queryOne("SELECT * FROM assets WHERE id = ?", [id]);
  if (!existing) return null;
  const now = new Date().toISOString();
  if (path !== undefined) {
    run("UPDATE assets SET zone = ?, path = ?, updated_at = ? WHERE id = ?", [zone, path, now, id]);
  } else {
    run("UPDATE assets SET zone = ?, updated_at = ? WHERE id = ?", [zone, now, id]);
  }
  save();
  return getAsset(id);
}
