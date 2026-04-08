export const ARTICLE_TYPES = ["fact", "procedure", "decision", "reference", "playbook", "anti-pattern"] as const;
export type ArticleType = typeof ARTICLE_TYPES[number];

export const MATURITY_LEVELS = ["draft", "candidate", "established", "proven", "deprecated"] as const;
export type Maturity = typeof MATURITY_LEVELS[number];

export const SCOPES = ["private", "team", "global"] as const;
export type Scope = typeof SCOPES[number];

export const FEEDBACK_OUTCOMES = ["helpful", "harmful", "neutral"] as const;
export type FeedbackOutcome = typeof FEEDBACK_OUTCOMES[number];

export const ZONES = ["permanent", "staging"] as const;
export type Zone = typeof ZONES[number];

export const SOURCES = ["upload", "generated"] as const;
export type Source = typeof SOURCES[number];

export interface ArticleVersion {
  version: number;
  title: string;
  content: string;
  updated_by: string;
  updated_at: string;
  change_summary: string;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  summary: string;
  type: ArticleType;
  maturity: Maturity;
  tags: string[];
  namespace: string;     // deprecated, use collection
  collection: string;    // AKP v1.0: slash-separated path
  project_id: string | null; // AKP v1.0: project scoping
  scope: Scope;
  confidence: number;
  helpful_count: number;
  harmful_count: number;
  version: number;
  related: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  previous_versions: ArticleVersion[];
}

export interface SearchResult extends Article {
  score: number;
}

export interface Episode {
  id: string;
  situation: string;
  outcome: string;
  reflection: string;
  intent: string;
  tags: string[];
  success: boolean;
  confidence: number;
  project_id: string | null;
  article_id: string | null;
  conversation_id: string | null;
  task_id: string | null;
  created_at: string;
  created_by: string;
  expires_at: string | null;
  access_count: number;
  updated_at: string;
}

export interface EpisodeSearchResult extends Episode {
  score: number;
}

export interface Asset {
  id: string;
  name: string;
  zone: Zone;
  path: string;
  mime_type: string;
  size_bytes: number;
  source: Source;
  project_id: string | null;
  article_id: string | null;
  episode_id: string | null;
  conversation_id: string | null;
  task_id: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  content?: string; // base64, only for local mode get
}
