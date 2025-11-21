import { TrackingJob } from "../types";

let localJobsStore: TrackingJob[] = [];

// Load from localStorage
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('rankTrackerJobs');
    if (stored) localJobsStore = JSON.parse(stored);
  } catch (e) { console.error("Storage Error", e); }
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
    searchMode, // Save the mode
    status: 'processing',
    progress: 5,
    createdAt: new Date().toISOString(),
    results: []
  };

  localJobsStore = [newJob, ...localJobsStore];
  saveToStorage();

  // Start the API call
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
        searchMode: job.searchMode // Pass mode to backend
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${errorText}`);
    }

    const data = await response.json();

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
    console.error("Tracking Error:", error);
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
