export const ARTICLE_TYPES = ["fact", "procedure", "decision", "reference", "playbook", "anti-pattern"] as const;
export type ArticleType = typeof ARTICLE_TYPES[number];

export const MATURITY_LEVELS = ["draft", "candidate", "established", "proven", "deprecated"] as const;
export type Maturity = typeof MATURITY_LEVELS[number];

export const SCOPES = ["private", "team", "global"] as const;
export type Scope = typeof SCOPES[number];

export const FEEDBACK_OUTCOMES = ["helpful", "harmful", "neutral"] as const;
export type FeedbackOutcome = typeof FEEDBACK_OUTCOMES[number];

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
  namespace: string;
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
