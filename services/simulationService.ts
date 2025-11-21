import { TrackingJob } from "../types";

let localJobsStore: TrackingJob[] = [];

// Load from storage on init
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('rankTrackerJobs');
    if (stored) localJobsStore = JSON.parse(stored);
  } catch (e) { console.error('Storage load error', e); }
}

const saveToStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('rankTrackerJobs', JSON.stringify(localJobsStore));
  }
};

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
    progress: 5, // Start with some progress
    createdAt: new Date().toISOString(),
    results: []
  };

  localJobsStore = [newJob, ...localJobsStore];
  saveToStorage();

  // Execute API call
  runBackendJob(newJob);
  
  return newJob;
};

const runBackendJob = async (job: TrackingJob) => {
  try {
    const response = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: job.targetUrl,
        queries: job.queries,
        location: job.location,
        device: job.device,
        searchMode: job.searchMode
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Server Error: ${err}`);
    }

    const data = await response.json();

    // Update job on success
    const idx = localJobsStore.findIndex(j => j.id === job.id);
    if (idx !== -1) {
      localJobsStore[idx] = {
        ...localJobsStore[idx],
        status: 'completed',
        progress: 100,
        results: data.results || [],
        completedAt: new Date().toISOString()
      };
      saveToStorage();
    }

  } catch (error) {
    console.error("Tracking Job Failed:", error);
    const idx = localJobsStore.findIndex(j => j.id === job.id);
    if (idx !== -1) {
      localJobsStore[idx] = {
        ...localJobsStore[idx],
        status: 'failed',
        progress: 0
      };
      saveToStorage();
    }
  }
};

export const getJobs = (): TrackingJob[] => [...localJobsStore];

export const deleteJob = (id: string) => {
  localJobsStore = localJobsStore.filter(j => j.id !== id);
  saveToStorage();
};

export const clearAllJobs = () => {
  localJobsStore = [];
  saveToStorage();
};
