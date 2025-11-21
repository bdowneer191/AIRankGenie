export type SearchMode = 'google' | 'google_ai_mode' | 'google_ask_ai';

export interface TrackingJob {
  id: string;
  targetUrl: string;
  queries: string[];
  location: string;
  device: 'desktop' | 'mobile';
  searchMode: SearchMode; // <--- Added tracking mode
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  results: TrackingResult[];
}

export interface TrackingResult {
  query: string;
  rank: number | null;
  url: string;
  history: { date: string; rank: number | null }[];
  aiOverview: {
    present: boolean;
    content?: string;
    analysis?: string;
    type?: string;
  };
  serpFeatures: string[];
  competitors: CompetitorResult[];
}

export interface CompetitorResult {
  rank: number;
  title: string;
  url: string;
  snippet: string;
}

export interface ApiConfig {
  geminiApiKey: string;
}
