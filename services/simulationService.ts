import { TrackingJob } from "../types";

let localJobsStore: TrackingJob[] = [];

// Helper to update job status
const updateJob = (id: string, updates: Partial<TrackingJob>) => {
  const idx = localJobsStore.findIndex(j => j.id === id);
  if (idx !== -1) {
    localJobsStore[idx] = { ...localJobsStore[idx], ...updates };
  }
};

export const createJob = (
  targetUrl: string, 
  queries: string[], 
  location: string, 
  device: 'desktop' | 'mobile'
): TrackingJob => { // Synchronous return

  const jobId = `job_${Date.now()}`;
  const createdAt = new Date().toISOString();

  const newJob: TrackingJob = {
    id: jobId,
    targetUrl,
    queries,
    location,
    device,
    status: 'processing',
    progress: 0,
    createdAt,
    results: []
  };

  localJobsStore.push(newJob);

  // Trigger async processing without awaiting
  // This avoids hanging the UI while waiting for the Vercel function
  processJob(newJob);
  
  return newJob;
};

const processJob = async (job: TrackingJob) => {
  try {
    // Relative path works because of Vite proxy or Vercel routing
    const response = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: job.targetUrl,
        queries: job.queries,
        location: job.location
      })
    });

    if (!response.ok) {
       throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    updateJob(job.id, {
      status: 'completed',
      progress: 100,
      results: data.results,
      completedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Job Failed:", error);
    updateJob(job.id, { status: 'failed', progress: 0 });
  }
};

export const getJobs = (): TrackingJob[] => {
  return [...localJobsStore].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};
