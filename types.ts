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
}

export interface TrackingResult {
  query: string;
  rank: number | null; // null means not found in top 100
  url: string;
  history: { date: string; rank: number | null }[];
  aiOverview: {
    present: boolean;
    content?: string; // The raw AI overview text (simulated)
    analysis?: string; // The Gemini analysis of the overview
    type?: string; // To distinguish between AI Overview vs Ask AI response
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

export interface SerpApiResponse {
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    snippet: string;
  }>;
  ai_overview?: {
    snippet?: string;
    text_blocks?: Array<{ snippet: string }>;
    answer?: string;
  };
  featured_snippet?: object;
  people_also_ask?: object;
  knowledge_panel?: object;
  local_results?: object;
  top_stories?: object;
  video_results?: object;
  image_results?: object;
  shopping_results?: object;
  sitelinks?: object;
}

// Mock Data Interface for simulation
export interface MockSerpResponse {
  organic_results: { position: number; title: string; link: string; snippet: string }[];
  ai_overview?: { snippet: string };
}
