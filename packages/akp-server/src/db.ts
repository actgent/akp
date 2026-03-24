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

  db.run("CREATE INDEX IF NOT EXISTS idx_articles_type ON articles(type)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_namespace ON articles(namespace)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_maturity ON articles(maturity)");
  db.run("CREATE INDEX IF NOT EXISTS idx_versions_article ON article_versions(article_id)");

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
  scope?: Scope;
  related?: string[];
  expires_at?: string;
  created_by?: string;
}): Article {
  const now = new Date().toISOString();
  const id = randomUUID();
  const summary = params.summary || params.content.substring(0, 200);

  run(
    `INSERT INTO articles (id, title, content, summary, type, maturity, tags, namespace, scope, confidence, helpful_count, harmful_count, version, related, created_by, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0.7, 0, 0, 1, ?, ?, ?, ?, ?)`,
    [
      id,
      params.title,
      params.content,
      summary,
      params.type,
      JSON.stringify(params.tags || []),
      params.namespace || "default",
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
  maturity?: Maturity;
  scope?: Scope;
  tags?: string[];
  limit?: number;
}): Article[] {
  const where: string[] = [];
  const params: any[] = [];

  if (filters.type) { where.push("type = ?"); params.push(filters.type); }
  if (filters.namespace) { where.push("namespace = ?"); params.push(filters.namespace); }
  if (filters.maturity) { where.push("maturity = ?"); params.push(filters.maturity); }
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
