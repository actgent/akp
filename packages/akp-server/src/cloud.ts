/**
 * HexaClaw Cloud API client for AKP.
 * When HEXACLAW_API_KEY is set, all operations route to the cloud
 * for semantic search, team sharing, and persistent storage.
 */

const API_BASE = process.env.HEXACLAW_API_BASE || "https://api.hexaclaw.com";
const API_KEY = process.env.HEXACLAW_API_KEY || "";

export function isCloudMode(): boolean {
  return API_KEY.length > 0;
}

export function getMode(): string {
  return isCloudMode() ? `cloud (${API_BASE})` : "local (SQLite at ~/.akp/knowledge.db)";
}

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HexaClaw API error (${res.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Cloud operations ──────────────────────────────────────────────────────────

// ── Article Cloud Operations ─────────────────────────────────────────────────

export async function cloudWrite(params: {
  title: string;
  content: string;
  type: string;
  id?: string;
  summary?: string;
  tags?: string[];
  namespace?: string;
  collection?: string;
  project_id?: string;
  scope?: string;
  related?: string[];
  expires_at?: string;
  change_summary?: string;
}): Promise<any> {
  if (params.id) {
    const body: Record<string, unknown> = {
      change_summary: params.change_summary || "Updated via AKP",
    };
    if (params.title) body.title = params.title;
    if (params.content) body.content = params.content;
    if (params.summary) body.summary = params.summary;
    if (params.tags) body.tags = params.tags;
    if (params.collection) { body.collection = params.collection; body.namespace = params.collection; }
    else if (params.namespace) body.namespace = params.namespace;
    if (params.project_id !== undefined) body.project_id = params.project_id;
    if (params.scope) body.scope = params.scope;
    if (params.related) body.related_ids = params.related;
    if (params.expires_at) body.expires_at = params.expires_at;
    return api("PUT", `/v1/wiki/${params.id}`, body);
  }

  const body: Record<string, unknown> = {
    title: params.title,
    content: params.content,
    type: params.type,
  };
  if (params.summary) body.summary = params.summary;
  if (params.tags) body.tags = params.tags;
  if (params.collection) { body.collection = params.collection; body.namespace = params.collection; }
  else if (params.namespace) body.namespace = params.namespace;
  if (params.project_id) body.project_id = params.project_id;
  if (params.scope) body.scope = params.scope || "team";
  if (params.related) body.related_ids = params.related;
  if (params.expires_at) body.expires_at = params.expires_at;
  return api("POST", "/v1/wiki", body);
}

export async function cloudSearch(params: {
  query?: string;
  type?: string;
  collection?: string;
  project_id?: string;
  maturity?: string;
  scope?: string;
  tags?: string[];
  include_deprecated?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<any> {
  const body: Record<string, unknown> = {};
  if (params.query) body.query = params.query;
  if (params.type) body.type = params.type;
  if (params.collection) { body.collection = params.collection; body.namespace = params.collection; }
  if (params.project_id) body.project_id = params.project_id;
  if (params.maturity) body.maturity = params.maturity;
  if (params.scope) body.scope = params.scope;
  if (params.tags) body.tags = params.tags;
  if (params.include_deprecated) body.include_deprecated = true;
  if (params.limit) body.limit = params.limit;
  if (params.cursor) body.cursor = params.cursor;
  return api("POST", "/v1/wiki/search", body);
}

export async function cloudRead(id: string): Promise<any> {
  return api("GET", `/v1/wiki/${id}`);
}

export async function cloudList(params: {
  type?: string;
  collection?: string;
  project_id?: string;
  maturity?: string;
  scope?: string;
  tags?: string;
  collections_only?: boolean;
  include_deprecated?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<any> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.collection) qs.set("collection", params.collection);
  if (params.project_id) qs.set("project_id", params.project_id);
  if (params.maturity) qs.set("maturity", params.maturity);
  if (params.scope) qs.set("scope", params.scope);
  if (params.tags) qs.set("tags", params.tags);
  if (params.collections_only) qs.set("collections_only", "true");
  if (params.include_deprecated) qs.set("include_deprecated", "true");
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  return api("GET", `/v1/wiki?${qs.toString()}`);
}

export async function cloudFeedback(id: string, outcome: string): Promise<any> {
  return api("POST", `/v1/wiki/${id}/feedback`, { outcome });
}

// ── Memory Cloud Operations ──────────────────────────────────────────────────

export async function cloudMemoryStore(params: Record<string, unknown>): Promise<any> {
  return api("POST", "/v1/memory", params);
}

export async function cloudMemorySearch(params: Record<string, unknown>): Promise<any> {
  return api("POST", "/v1/memory/search", params);
}

export async function cloudMemoryDelete(id: string): Promise<any> {
  return api("DELETE", `/v1/memory/${id}`);
}

// ── Asset Cloud Operations ───────────────────────────────────────────────────

export async function cloudAssetUpload(params: Record<string, unknown>): Promise<any> {
  return api("POST", "/v1/assets", params);
}

export async function cloudAssetGet(id: string): Promise<any> {
  return api("GET", `/v1/assets/${id}`);
}

export async function cloudAssetList(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params);
  return api("GET", `/v1/assets?${qs.toString()}`);
}

export async function cloudAssetDelete(id: string): Promise<any> {
  return api("DELETE", `/v1/assets/${id}`);
}

export async function cloudAssetUpdate(id: string, params: Record<string, unknown>): Promise<any> {
  return api("PUT", `/v1/assets/${id}`, params);
}
