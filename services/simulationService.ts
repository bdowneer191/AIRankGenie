import { TrackingJob, TrackingResult } from "../types";

let localJobsStore: TrackingJob[] = [];

// --- Persistence Helpers ---
const loadFromStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('rankTrackerJobs');
      if (stored) localJobsStore = JSON.parse(stored);
    } catch (e) { console.error("Storage Load Error", e); }
  }
};

const saveToStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('rankTrackerJobs', JSON.stringify(localJobsStore));
  }
};

// Initialize
loadFromStorage();

// --- CRUD Operations ---
export const getJobs = (): TrackingJob[] => {
  return [...localJobsStore].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

export const deleteJob = (id: string) => {
  localJobsStore = localJobsStore.filter(j => j.id !== id);
  saveToStorage();
};

export const clearAllJobs = () => {
  localJobsStore = [];
  saveToStorage();
};

// --- Job Creation & Orchestration ---
export const createJob = (
  targetUrl: string, 
  queries: string[], 
  location: string, 
  device: 'desktop' | 'mobile',
  searchMode: 'google' | 'google_ai_mode' | 'google_ask_ai'
): TrackingJob => {
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
    results: []
  };

  // Save initial state
  localJobsStore = [newJob, ...localJobsStore];
  saveToStorage();

  // Start the Client-Side Batching Process
  processJobInBatches(newJob);
  
  return newJob;
};

// --- The Batch Processor ---
const processJobInBatches = async (job: TrackingJob) => {
  const BATCH_SIZE = 1; // Process 1 keyword at a time to be perfectly safe
  let completedCount = 0;
  let allResults: TrackingResult[] = [];

  // 1. Clone the queries to process
  const queue = [...job.queries];

  // 2. Update status
  updateJobState(job.id, { status: 'processing', progress: 5 });

  // 3. Iterate through the queue
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    
    try {
      // Call the API for just this small batch
      console.log(`[Job ${job.id}] Processing batch: ${batch.join(', ')}`);
      
      const response = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: job.targetUrl,
          queries: batch, // Only sending 1 keyword
          location: job.location,
          device: job.device,
          searchMode: job.searchMode
        })
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      const newResults = data.results || [];

      // Accumulate results
      allResults = [...allResults, ...newResults];
      completedCount += batch.length;

      // Calculate Progress
      const progress = Math.round((completedCount / job.queries.length) * 100);

      // Update Store Incrementally (Real-time feedback!)
      updateJobState(job.id, {
        progress,
        results: allResults,
        // Only mark completed if we hit 100%
        status: progress === 100 ? 'completed' : 'processing',
        completedAt: progress === 100 ? new Date().toISOString() : undefined
      });

    } catch (error) {
      console.error(`[Job ${job.id}] Batch failed for ${batch}:`, error);
      
      // Add failed results so the report isn't empty
      const failedResults = batch.map(q => ({
        query: q,
        rank: null,
        url: job.targetUrl,
        history: [],
        aiOverview: { present: false, content: "Failed to fetch" },
        serpFeatures: [],
        competitors: []
      }));
      
      allResults = [...allResults, ...failedResults];
      completedCount += batch.length;
      
      // Update state even on error to keep progress moving
      updateJobState(job.id, {
        progress: Math.round((completedCount / job.queries.length) * 100),
        results: allResults
      });
    }
  }
};

// Helper to safely update state
const updateJobState = (id: string, updates: Partial<TrackingJob>) => {
  const idx = localJobsStore.findIndex(j => j.id === id);
  if (idx !== -1) {
    localJobsStore[idx] = { ...localJobsStore[idx], ...updates };
    saveToStorage();
  }
};
