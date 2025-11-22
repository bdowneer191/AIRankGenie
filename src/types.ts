export type SearchMode = 'google' | 'google_ai_mode' | 'google_ask_ai';

export interface TrackingJob {
  id: string;
  targetUrl: string;
  queries: string[];
  location: string;
  device: 'desktop' | 'mobile';
  searchMode: SearchMode;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  results: TrackingResult[];
  volatilityIndex?: number; // Added to match usage in trackingService.ts
}

export interface TrackingResult {
  query: string;
  rank: number | null;
  url: string;
  searchVolume?: number; // Added to match usage in trackingService.ts
  history: { date: string; rank: number | null; searchVolume?: number }[];
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
