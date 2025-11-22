import { TrackingJob, TrackingResult } from "../types";

// Storage key
const STORAGE_KEY = 'rankTrackerJobs_v2';
const HISTORY_KEY = 'rankTrackerHistory_v2';

// Historical data storage for trend analysis
interface HistoricalData {
  [keyword: string]: {
    date: string;
    rank: number | null;
    searchVolume?: number;
  }[];
}

let localJobsStore: TrackingJob[] = [];
let historicalData: HistoricalData = {};

// Load from storage
const loadFromStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) localJobsStore = JSON.parse(stored);
      
      const history = localStorage.getItem(HISTORY_KEY);
      if (history) historicalData = JSON.parse(history);
    } catch (e) {
      console.error("Storage Load Error", e);
    }
  }
};

// Save to storage
const saveToStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localJobsStore));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historicalData));
  }
};

// Initialize
loadFromStorage();

// Calculate volatility index
const calculateVolatility = (results: TrackingResult[]): number => {
  if (results.length < 2) return 0;
  
  let totalChange = 0;
  let count = 0;
  
  results.forEach(result => {
    const history = historicalData[result.query] || [];
    if (history.length >= 2) {
      const recent = history.slice(-2);
      const change = Math.abs((recent[1].rank || 100) - (recent[0].rank || 100));
      totalChange += change;
      count++;
    }
  });
  
  return count > 0 ? Math.round((totalChange / count) * 10) / 10 : 0;
};

// Update historical data
const updateHistoricalData = (results: TrackingResult[]) => {
  results.forEach(result => {
    if (!historicalData[result.query]) {
      historicalData[result.query] = [];
    }
    
    historicalData[result.query].push({
      date: new Date().toISOString(),
      rank: result.rank,
      searchVolume: result.searchVolume
    });
    
    // Keep only last 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    historicalData[result.query] = historicalData[result.query].filter(
      h => new Date(h.date).getTime() > thirtyDaysAgo
    );
  });
  
  saveToStorage();
};

// Get historical data for keywords
export const getHistoricalData = (keywords: string[]): HistoricalData => {
  const filtered: HistoricalData = {};
  keywords.forEach(keyword => {
    if (historicalData[keyword]) {
      filtered[keyword] = historicalData[keyword];
    }
  });
  return filtered;
};

// Get all jobs sorted by date
export const getJobs = (): TrackingJob[] => {
  return [...localJobsStore].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

// Delete a job
export const deleteJob = (id: string) => {
  localJobsStore = localJobsStore.filter(j => j.id !== id);
  saveToStorage();
};

// Clear all jobs
export const clearAllJobs = () => {
  localJobsStore = [];
  historicalData = {};
  saveToStorage();
};

// Create and process a new job (NO SIMULATION)
export const createJob = async (
  targetUrl: string, 
  queries: string[], 
  location: string, 
  device: 'desktop' | 'mobile',
  searchMode: 'google' | 'google_ai_mode' | 'google_ask_ai'
): Promise<TrackingJob> => {
  const jobId = `job_${Date.now()}`;
  
  const newJob: TrackingJob = {
    id: jobId,
    targetUrl,
    queries,
    location,
    device,
    searchMode,
    status: 'processing',
    progress: 0,
    createdAt: new Date().toISOString(),
    results: [],
    volatilityIndex: 0
  };
  
  // Save initial job
  localJobsStore = [newJob, ...localJobsStore];
  saveToStorage();
  
  // Process in real-time with batching
  await processJobInBatches(newJob);
  
  return newJob;
};

// Real-time processing with intelligent batching
const processJobInBatches = async (job: TrackingJob) => {
  const BATCH_SIZE = 2; // Stay under Vercel's 10s timeout
  const MAX_RETRIES = 2;
  let allResults: TrackingResult[] = [];
  let processedCount = 0;
  
  const queue = [...job.queries];
  
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    let retries = 0;
    let success = false;
    
    while (retries < MAX_RETRIES && !success) {
      try {
        console.log(`Processing batch ${i / BATCH_SIZE + 1}, attempt ${retries + 1}`);
        
        const response = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: job.targetUrl,
            queries: batch,
            location: job.location,
            device: job.device,
            searchMode: job.searchMode
          })
        });
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        const batchResults = data.results || [];
        
        allResults = [...allResults, ...batchResults];
        processedCount += batch.length;
        success = true;
        
        // Update historical data
        updateHistoricalData(batchResults);
        
        // Calculate metrics
        const progress = Math.round((processedCount / job.queries.length) * 100);
        const volatilityIndex = calculateVolatility(allResults);
        
        // Update job state
        updateJobState(job.id, {
          progress,
          results: allResults,
          volatilityIndex,
          status: progress === 100 ? 'completed' : 'processing',
          completedAt: progress === 100 ? new Date().toISOString() : undefined
        });
        
        console.log(`Batch completed: ${processedCount}/${job.queries.length} keywords`);
        
      } catch (error) {
        retries++;
        console.error(`Batch failed (attempt ${retries}):`, error);
        
        if (retries >= MAX_RETRIES) {
          // Add failed results
          const failedResults = batch.map(q => ({
            query: q,
            rank: null,
            url: job.targetUrl,
            searchVolume: 1000,
            history: [],
            aiOverview: { present: false, content: "Failed to fetch data" },
            serpFeatures: [],
            competitors: []
          }));
          
          allResults = [...allResults, ...failedResults];
          processedCount += batch.length;
          
          updateJobState(job.id, {
            progress: Math.round((processedCount / job.queries.length) * 100),
            results: allResults
          });
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < queue.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Mark as completed or failed
  updateJobState(job.id, {
    status: allResults.length === job.queries.length ? 'completed' : 'failed',
    completedAt: new Date().toISOString()
  });
};

// Update job state
const updateJobState = (id: string, updates: Partial<TrackingJob>) => {
  const idx = localJobsStore.findIndex(j => j.id === id);
  if (idx !== -1) {
    localJobsStore[idx] = { ...localJobsStore[idx], ...updates };
    saveToStorage();
  }
};

// Export for trend analysis
export const getTrendData = (keyword: string) => {
  return historicalData[keyword] || [];
};

// Calculate trend direction
export const getTrendDirection = (keyword: string): 'up' | 'down' | 'stable' => {
  const history = historicalData[keyword] || [];
  if (history.length < 2) return 'stable';
  
  const recent = history.slice(-2);
  const oldRank = recent[0].rank || 100;
  const newRank = recent[1].rank || 100;
  
  if (newRank < oldRank - 2) return 'up'; // Lower rank = better
  if (newRank > oldRank + 2) return 'down';
  return 'stable';
};
