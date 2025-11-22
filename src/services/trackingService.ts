import { supabase } from '../lib/supabase';
import { TrackingJob, TrackingResult, SearchMode } from '../types';

// --- Database Actions ---

export const createJobInDb = async (
  targetUrl: string,
  queries: string[],
  location: string,
  device: string,
  searchMode: string
): Promise<string | null> => {
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
    ai_content: r.aiOverview.content,
    ai_sentiment: r.aiOverview.sentiment
  }));

  const { error } = await supabase.from('results').insert(dbRows);
  if (error) console.error('Error saving results:', error);
};

export const markJobComplete = async (jobId: string) => {
  await supabase
    .from('jobs')
    .update({ status: 'completed' })
    .eq('id', jobId);
};

// --- Fetching Actions (For Dashboard) ---

export const getJobs = async (): Promise<TrackingJob[]> => {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`
      *,
      results (*)
    `)
    .order('created_at', { ascending: false });

  if (error || !jobs) {
    console.error("Error fetching jobs:", error);
    return [];
  }

  // Transform DB shape back to your UI Type shape
  return jobs.map((j: any) => ({
    id: j.id,
    targetUrl: j.target_url,
    location: j.location,
    device: j.device,
    searchMode: j.search_mode,
    status: j.status,
    createdAt: j.created_at,
    progress: j.status === 'completed' ? 100 : 0,
    queries: j.results ? j.results.map((r: any) => r.query) : [],
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

export const deleteJob = async (id: string) => {
  const { error } = await supabase.from('jobs').delete().eq('id', id);
  if (error) console.error("Error deleting job:", error);
};

export const clearAllJobs = async () => {
   // Optional: Add a way to clear all data if needed, but usually not exposed in production
   console.warn("clearAllJobs is not implemented for safety.");
};

// --- Orchestration ---

export const createJob = async (
  targetUrl: string,
  queries: string[],
  location: string,
  device: 'desktop' | 'mobile',
  searchMode: SearchMode
): Promise<TrackingJob | null> => {

  // 1. Create Job in DB
  const jobId = await createJobInDb(targetUrl, queries, location, device, searchMode);
  if (!jobId) return null;

  // 2. Call API
  try {
    const response = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl,
        queries,
        location,
        device,
        searchMode
      })
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    // 3. Save Results
    await saveResultsToDb(jobId, results);

    // 4. Mark Complete
    await markJobComplete(jobId);

    // Return the new job object (constructed locally or fetched)
    // For speed, let's construct it locally based on inputs and results
    return {
        id: jobId,
        targetUrl,
        queries,
        location,
        device,
        searchMode,
        status: 'completed',
        progress: 100,
        createdAt: new Date().toISOString(),
        results,
    };

  } catch (error) {
    console.error("Tracking failed:", error);
    // Mark as failed in DB
    await supabase.from('jobs').update({ status: 'failed' }).eq('id', jobId);
    return null;
  }
};
