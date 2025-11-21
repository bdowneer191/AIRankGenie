import { TrackingJob, TrackingResult } from "../types";

let localJobsStore: TrackingJob[] = [];

// --- Persistence ---
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

// --- CRUD ---
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

// --- Batch Processing Orchestrator ---
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

  localJobsStore = [newJob, ...localJobsStore];
  saveToStorage();

  // Start processing in background
  processJobQueue(newJob);
  
  return newJob;
};

const processJobQueue = async (job: TrackingJob) => {
  const BATCH_SIZE = 1; // 1 keyword at a time to avoid Vercel timeouts
  let allResults: TrackingResult[] = [];
  let processedCount = 0;

  // Clone queries to avoid mutation issues
  const queue = [...job.queries];

  // Initial Status
  updateJobState(job.id, { status: 'processing', progress: 5 });

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    
    try {
      console.log(`[Orchestrator] Sending batch: ${batch}`);
      
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

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      allResults = [...allResults, ...(data.results || [])];
      processedCount += batch.length;

      // Real-time Progress Update
      const progress = Math.round((processedCount / job.queries.length) * 100);
      
      updateJobState(job.id, {
        progress,
        results: allResults,
        status: progress === 100 ? 'completed' : 'processing',
        completedAt: progress === 100 ? new Date().toISOString() : undefined
      });

    } catch (error) {
      console.error(`[Orchestrator] Batch failed:`, error);
      
      // Add error placeholders so report completes
      const failedResults = batch.map(q => ({
        query: q, rank: null, url: job.targetUrl, history: [],
        aiOverview: { present: false, content: "Check failed" },
        serpFeatures: [], competitors: []
      }));
      allResults = [...allResults, ...failedResults];
      processedCount += batch.length;

      updateJobState(job.id, {
        progress: Math.round((processedCount / job.queries.length) * 100),
        results: allResults
      });
    }
  }
};

const updateJobState = (id: string, updates: Partial<TrackingJob>) => {
  const idx = localJobsStore.findIndex(j => j.id === id);
  if (idx !== -1) {
    localJobsStore[idx] = { ...localJobsStore[idx], ...updates };
    saveToStorage();
  }
};
