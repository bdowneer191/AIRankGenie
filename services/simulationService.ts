import { TrackingJob, TrackingResult } from "../types";

// Replace the entire simulation logic with this:

export const createJob = async (
  targetUrl: string, 
  queries: string[], 
  location: string, 
  device: 'desktop' | 'mobile'
): Promise<TrackingJob> => {

  // Create a temporary ID for the UI
  const jobId = `job_${Date.now()}`;
  const createdAt = new Date().toISOString();

  const newJob: TrackingJob = {
    id: jobId,
    targetUrl,
    queries,
    location,
    device,
    status: 'processing', // Immediately processing
    progress: 0,
    createdAt,
    results: []
  };

  // We trigger the API call asynchronously so the UI doesn't freeze
  // In a real app, use React Query or a dedicated hook for this
  processJob(newJob);
  
  return newJob;
};

// Store jobs in memory for this session (UI State)
let localJobsStore: TrackingJob[] = [];

const processJob = async (job: TrackingJob) => {
  localJobsStore.push(job);
  
  try {
    const response = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: job.targetUrl,
        queries: job.queries,
        location: job.location
      })
    });

    if (!response.ok) throw new Error('API request failed');

    const data = await response.json();

    // Update job in store
    const jobIndex = localJobsStore.findIndex(j => j.id === job.id);
    if (jobIndex !== -1) {
      localJobsStore[jobIndex] = {
        ...localJobsStore[jobIndex],
        status: 'completed',
        progress: 100,
        results: data.results,
        completedAt: new Date().toISOString()
      };
    }

  } catch (error) {
    console.error("Job Failed:", error);
    const jobIndex = localJobsStore.findIndex(j => j.id === job.id);
    if (jobIndex !== -1) {
      localJobsStore[jobIndex] = { ...localJobsStore[jobIndex], status: 'failed', progress: 0 };
    }
  }
};

// Simple polling getter for the UI
export const getJobs = (): TrackingJob[] => {
  return [...localJobsStore].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};
