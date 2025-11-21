import { TrackingJob, TrackingResult } from "../types";

let localJobsStore: TrackingJob[] = [];

// Load from localStorage on init
const loadFromStorage = () => {
  try {
    const stored = localStorage.getItem('rankTrackerJobs');
    if (stored) {
      localJobsStore = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load jobs from storage:', e);
  }
};

// Save to localStorage
const saveToStorage = () => {
  try {
    localStorage.setItem('rankTrackerJobs', JSON.stringify(localJobsStore));
  } catch (e) {
    console.error('Failed to save jobs to storage:', e);
  }
};

// Initialize on module load
loadFromStorage();

const updateJob = (id: string, updates: Partial<TrackingJob>) => {
  const idx = localJobsStore.findIndex(j => j.id === id);
  if (idx !== -1) {
    localJobsStore[idx] = { ...localJobsStore[idx], ...updates };
    saveToStorage();
  }
};

export const createJob = (
  targetUrl: string, 
  queries: string[], 
  location: string, 
  device: 'desktop' | 'mobile'
): TrackingJob => {
  const jobId = `job_${Date.now()}`;
  const createdAt = new Date().toISOString();

  console.log(`Creating job ${jobId} for ${targetUrl} with ${queries.length} queries.`);

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
  saveToStorage();

  // Start async processing
  processJob(newJob);
  
  return newJob;
};

const simulateProgress = (jobId: string, totalQueries: number): NodeJS.Timeout => {
  let currentProgress = 0;
  const increment = 80 / (totalQueries * 2); // Reach ~80% during processing

  return setInterval(() => {
    currentProgress = Math.min(currentProgress + increment, 80);
    updateJob(jobId, { progress: Math.round(currentProgress) });
  }, 500);
};

const processJob = async (job: TrackingJob) => {
  console.log(`Starting processing for job ${job.id}...`);
  const progressInterval = simulateProgress(job.id, job.queries.length);

  try {
    console.log('Sending request to /api/track...');
    const response = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: job.targetUrl,
        queries: job.queries,
        location: job.location,
        device: job.device
      })
    });

    console.log(`Response status for job ${job.id}: ${response.status}`);

    clearInterval(progressInterval);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`API request failed for job ${job.id}:`, errorData);
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Job ${job.id} completed successfully with ${data.results?.length || 0} results.`);

    updateJob(job.id, {
      status: 'completed',
      progress: 100,
      results: data.results || [],
      completedAt: new Date().toISOString()
    });

  } catch (error) {
    clearInterval(progressInterval);
    console.error("Job Failed:", error);
    updateJob(job.id, {
      status: 'failed',
      progress: 0,
      completedAt: new Date().toISOString()
    });
  }
};

export const getJobs = (): TrackingJob[] => {
  return [...localJobsStore].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

export const deleteJob = (id: string): void => {
  localJobsStore = localJobsStore.filter(j => j.id !== id);
  saveToStorage();
};

export const clearAllJobs = (): void => {
  localJobsStore = [];
  saveToStorage();
};
