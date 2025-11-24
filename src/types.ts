// ============================================================================
// ENHANCED TYPE DEFINITIONS FOR AI RANK TRACKER
// ============================================================================

// --- Search Modes ---
export type SearchMode = 
  | 'google'           // Standard Google Search (tracks organic + AI Overview)
  | 'google_ai_mode'   // Google AI Mode (dedicated AI results with citations)
  | 'google_ask_ai';   // Google Ask AI (conversational AI responses)

// --- Job Status ---
export type JobStatus = 
  | 'queued'      // Job created, waiting to start
  | 'processing'  // Currently fetching data
  | 'completed'   // All queries processed
  | 'failed'      // Error occurred
  | 'partial';    // Some queries failed

// --- Sentiment Types ---
export type SentimentType = 'positive' | 'neutral' | 'negative' | 'mixed';

// --- AI Overview Types ---
export type AIOverviewType = 
  | 'standard'    // Basic AI snippet
  | 'expanded'    // Full AI overview with sections
  | 'carousel'    // Card-based overview
  | 'none';       // No AI overview present

// ============================================================================
// MAIN INTERFACES
// ============================================================================

/**
 * Main Tracking Job
 * Represents a complete tracking project with all settings and results
 */
export interface TrackingJob {
  id: string;
  targetUrl: string;
  queries: string[];
  location: string;
  device: 'desktop' | 'mobile';
  searchMode: SearchMode;
  status: JobStatus;
  progress: number; // 0-100
  createdAt: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
  results: TrackingResult[];
  
  // Analytics
  volatilityIndex?: number; // 0-100, measures rank stability
  totalKeywords: number;
  rankedKeywords: number;
  aiFeatureCount: number;
  averageRank?: number;
  
  // Error tracking
  errors?: JobError[];
}

/**
 * Individual Keyword Tracking Result
 * Contains all data for a single keyword query
 */
export interface TrackingResult {
  query: string;
  
  // Standard Ranking
  rank: number | null; // Position in organic results (1-100+)
  url: string; // The specific URL that ranked
  title?: string; // Page title from SERP
  snippet?: string; // Meta description/snippet
  
  // Search Volume & Metrics
  searchVolume?: number;
  cpc?: number; // Cost per click (if available)
  competition?: number; // 0-1 scale
  
  // Historical Data
  history: RankHistory[];
  
  // AI Overview Data (ENHANCED)
  aiOverview: AIOverviewData;
  
  // SERP Features
  serpFeatures: SERPFeature[];
  
  // Competitor Analysis
  competitors: CompetitorResult[];
  
  // Processing Status
  processingStatus?: 'pending' | 'complete' | 'failed';
  serpapiId?: string; // For async tracking
  lastChecked?: string; // ISO timestamp
  
  // Error tracking
  error?: string;
}

/**
 * ENHANCED AI Overview Data Structure
 * Tracks all AI-related information for a query
 */
export interface AIOverviewData {
  present: boolean;
  type: AIOverviewType;
  content?: string; // Full AI-generated text
  
  // Citations & Sources (CRITICAL FOR TRACKING)
  citations: AIcitation[];
  userDomainCited: boolean; // Quick check: Is target URL cited?
  userDomainPosition?: number; // Position in citation list (1, 2, 3...)
  
  // Analysis
  analysis?: string; // Gemini-generated insight
  sentiment?: SentimentType;
  topics?: string[]; // Key topics mentioned
  entities?: string[]; // Named entities (brands, products)
  
  // Content Metrics
  contentLength?: number; // Character count
  citationCount?: number; // Total number of sources cited
  
  // Confidence & Quality
  confidence?: number; // 0-1, how confident AI seems
  accuracy?: 'high' | 'medium' | 'low' | 'unknown';
  
  // Metadata
  generatedAt?: string; // When AI content was generated
  model?: string; // Which AI model (Gemini, GPT, etc.)
}

/**
 * AI Citation Structure
 * Represents a single source cited in AI Overview
 */
export interface AIcitation {
  position: number; // 1, 2, 3... (order in citation list)
  url: string;
  domain: string; // Extracted domain
  title?: string;
  snippet?: string; // Preview text
  isUserDomain: boolean; // Is this the tracked domain?
  isCompetitor: boolean; // Is this a known competitor?
  
  // Citation Quality
  prominence: 'primary' | 'secondary' | 'mention'; // How strongly cited
  context?: string; // Surrounding text where cited
}

/**
 * SERP Feature Tracking
 * Different types of SERP features that can appear
 */
export interface SERPFeature {
  type: SERPFeatureType;
  present: boolean;
  data?: any; // Feature-specific data
  userDomainPresent?: boolean; // Is target URL in this feature?
}

export type SERPFeatureType =
  | 'ai_overview'       // AI-generated overview
  | 'featured_snippet'  // Featured snippet box
  | 'people_also_ask'   // PAA accordion
  | 'knowledge_panel'   // Knowledge graph
  | 'local_pack'        // Local business results
  | 'shopping'          // Shopping results
  | 'video'             // Video carousel
  | 'images'            // Image pack
  | 'news'              // Top stories
  | 'twitter'           // Twitter results
  | 'site_links'        // Site links
  | 'reviews';          // Review stars

/**
 * Competitor Result
 * Represents a competing result in the SERP
 */
export interface CompetitorResult {
  rank: number;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  
  // Rich snippet data
  rating?: number; // Star rating (0-5)
  reviewCount?: number;
  price?: string;
  
  // AI presence
  citedInAI: boolean;
  aiCitationPosition?: number;
  
  // Comparison metrics
  isKnownCompetitor?: boolean;
  domainAuthority?: number; // If available
}

/**
 * Rank History Entry
 * Tracks rank changes over time
 */
export interface RankHistory {
  date: string; // ISO date
  rank: number | null;
  searchVolume?: number;
  aiPresent: boolean;
  aiCited: boolean;
  
  // Change indicators
  rankChange?: number; // +/- from previous
  volatility?: number; // Measure of rank instability
}

/**
 * Job Error Tracking
 */
export interface JobError {
  query: string;
  timestamp: string;
  error: string;
  code?: string;
  retryable: boolean;
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

export interface ApiConfig {
  geminiApiKey: string;
  serpApiKey: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface SerpApiParams {
  query: string;
  engine: 'google' | 'google_ai_mode' | 'google_ask_ai';
  location?: string;
  device?: 'desktop' | 'mobile';
  gl?: string; // Country code
  hl?: string; // Language code
  num?: number; // Number of results
  async?: boolean; // Use async API
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Job Analytics Summary
 * Computed metrics for the entire job
 */
export interface JobAnalytics {
  totalQueries: number;
  rankedQueries: number;
  rankingRate: number; // Percentage
  
  // AI Metrics
  aiOverviewRate: number; // % of queries with AI
  aiCitationRate: number; // % where user is cited
  averageAICitationPosition?: number;
  
  // Rank Distribution
  top3Count: number;
  top10Count: number;
  top20Count: number;
  
  // Competitor Insights
  topCompetitors: CompetitorSummary[];
  
  // Volatility
  overallVolatility: number; // 0-100
  
  // Opportunities
  opportunities: Opportunity[];
}

export interface CompetitorSummary {
  domain: string;
  appearances: number; // How many queries they rank for
  averageRank: number;
  aiCitations: number; // How many times cited in AI
}

export interface Opportunity {
  type: 'ranking_gap' | 'ai_gap' | 'feature_gap' | 'competitor_weakness';
  query: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  potentialImpact: number; // 0-100
}

// ============================================================================
// GEMINI ANALYSIS
// ============================================================================

/**
 * Gemini Analysis Request
 */
export interface GeminiAnalysisRequest {
  query: string;
  aiOverviewContent: string;
  userUrl: string;
  userSnippet?: string;
  competitors: CompetitorResult[];
  serpFeatures: SERPFeature[];
}

/**
 * Gemini Analysis Response
 */
export interface GeminiAnalysisResponse {
  insight: string; // Main strategic recommendation
  sentiment: SentimentType;
  topics: string[];
  entities: string[];
  contentGaps: string[]; // What's missing from user's content
  competitorAdvantages: string[]; // What competitors do better
  actionableSteps: string[]; // Specific recommendations
  confidence: number; // 0-1
}

// ============================================================================
// DATABASE TYPES (Supabase)
// ============================================================================

export interface DBJob {
  id: string;
  target_url: string;
  location: string;
  device: string;
  search_mode: SearchMode;
  status: JobStatus;
  created_at: string;
  completed_at?: string;
}

export interface DBResult {
  id: string;
  job_id: string;
  query: string;
  rank: number | null;
  url: string;
  search_volume: number;
  serpapi_id?: string;
  processing_status?: string;
  ai_present: boolean;
  ai_content?: string;
  ai_sentiment?: SentimentType;
  created_at: string;
}

export interface DBCitation {
  id: string;
  result_id: string;
  position: number;
  url: string;
  domain: string;
  title?: string;
  snippet?: string;
  is_user_domain: boolean;
  is_competitor: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  loading: LoadingState;
  error: string | null;
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

export const isJobComplete = (job: TrackingJob): boolean => {
  return job.status === 'completed' || job.status === 'partial';
};

export const isJobFailed = (job: TrackingJob): boolean => {
  return job.status === 'failed';
};

export const calculateVisibilityScore = (job: TrackingJob): number => {
  if (job.totalKeywords === 0) return 0;
  
  const rankingWeight = (job.rankedKeywords / job.totalKeywords) * 50;
  const aiWeight = (job.aiFeatureCount / job.totalKeywords) * 50;
  
  return Math.round(rankingWeight + aiWeight);
};

export const getSearchModeLabel = (mode: SearchMode): string => {
  const labels: Record<SearchMode, string> = {
    'google': 'Standard Google Search',
    'google_ai_mode': 'Google AI Mode',
    'google_ask_ai': 'Google Ask AI'
  };
  return labels[mode];
};

export const getStatusColor = (status: JobStatus): string => {
  const colors: Record<JobStatus, string> = {
    'queued': 'bg-gray-100 text-gray-700',
    'processing': 'bg-blue-100 text-blue-700',
    'completed': 'bg-green-100 text-green-700',
    'failed': 'bg-red-100 text-red-700',
    'partial': 'bg-yellow-100 text-yellow-700'
  };
  return colors[status];
};
