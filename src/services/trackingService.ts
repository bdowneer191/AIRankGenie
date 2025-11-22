import { supabase } from '../lib/supabase';
import { TrackingJob, TrackingResult } from "../types";

// --- Database Helpers ---

export const createJobInDb = async (
  targetUrl: string,
  queries: string[],
  location: string,
  device: string,
  searchMode: string
): Promise<string | null> => {
  // Queries are not stored in jobs table in this schema, only metadata
  const { data, error } = await supabase
    .from('jobs')
    .insert([{ target_url: targetUrl, location, device, search_mode: searchMode, status: 'processing' }])
    .select()
    .single();

  if (error) {
    console.error('Error creating job:', error);
    return null;
  }
  return data.id;
};

export const saveResultsToDb = async (jobId: string, results: TrackingResult[]) => {
  const dbRows = results.map(r => ({
    job_id: jobId,
    query: r.query,
    rank: r.rank,
    url: r.url,
    search_volume: r.searchVolume || 0,
    ai_present: r.aiOverview.present,
    ai_content: r.aiOverview.content || '',
    ai_sentiment: r.aiOverview.sentiment || 'neutral'
  }));

  const { error } = await supabase.from('results').insert(dbRows);
  if (error) console.error('Error saving results:', error);
};

export const markJobComplete = async (jobId: string) => {
  await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId);
};

export const markJobFailed = async (jobId: string) => {
  await supabase.from('jobs').update({ status: 'failed' }).eq('id', jobId);
};

export const deleteJob = async (id: string) => {
  const { error } = await supabase.from('jobs').delete().eq('id', id);
  if (error) console.error("Error deleting job:", error);
};

export const clearAllJobs = async () => {
    console.warn("clearAllJobs is not implemented for safety.");
};


// --- The Main Logic: Orchestrator ---

export const createJob = async (
  targetUrl: string,
  queries: string[],
  location: string,
  device: 'desktop' | 'mobile',
  searchMode: 'google' | 'google_ai_mode' | 'google_ask_ai'
): Promise<TrackingJob | null> => {
  // 1. Create Job in DB
  const jobId = await createJobInDb(targetUrl, queries, location, device, searchMode);
  if (!jobId) throw new Error("Failed to initialize job in database");

  // 2. Start Background Processing (Client-Side Batching)
  // We don't await this so the UI returns immediately
  processJobInBatches(jobId, targetUrl, queries, location, searchMode);

  // Return a temporary local object for the UI to display immediately
  return {
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
};

const processJobInBatches = async (
  jobId: string,
  targetUrl: string,
  queries: string[],
  location: string,
  searchMode: string
) => {
  const BATCH_SIZE = 3; // Safe limit for Vercel Free Tier (10s timeout)

  try {
    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE);

      // Call our API
      const response = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, queries: batch, location, searchMode })
      });

      if (!response.ok) throw new Error(`Batch failed: ${response.statusText}`);

      const data = await response.json();

      // Save this batch to DB
      if (data.results && data.results.length > 0) {
        await saveResultsToDb(jobId, data.results);
      }

      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 1000));
    }

    // All batches done
    await markJobComplete(jobId);

  } catch (error) {
    console.error("Job processing error:", error);
    await markJobFailed(jobId);
  }
};

// --- Fetching for Dashboard ---

export const getJobsFromDb = async (): Promise<TrackingJob[]> => {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`*, results(*)`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching jobs:", error);
    return [];
  }

  // Transform DB shape to UI shape
  return jobs.map((j: any) => ({
    id: j.id,
    targetUrl: j.target_url,
    // If results exist, map them to queries. If no results yet (and since queries aren't in job table), this might be empty initially.
    queries: j.results ? j.results.map((r: any) => r.query) : [],
    location: j.location,
    device: j.device,
    searchMode: j.search_mode,
    status: j.status,
    progress: j.status === 'completed' ? 100 : (j.results && j.results.length > 0 ? 50 : 0), // Approx progress
    createdAt: j.created_at,
    results: j.results ? j.results.map((r: any) => ({
      query: r.query,
      rank: r.rank,
      url: r.url,
      searchVolume: r.search_volume,
      aiOverview: {
        present: r.ai_present,
        content: r.ai_content,
        sentiment: r.ai_sentiment
      },
      history: [],
      competitors: [],
      serpFeatures: []
    })) : []
  }));
};

// Alias for compatibility with components
export const getJobs = getJobsFromDb;
