export interface TrackingJob {
  id: string;
  targetUrl: string;
  queries: string[];
  location: string;
  device: 'desktop' | 'mobile';
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

// Mock Data Interface for simulation
export interface MockSerpResponse {
  organic_results: { position: number; title: string; link: string; snippet: string }[];
  ai_overview?: { snippet: string };
}