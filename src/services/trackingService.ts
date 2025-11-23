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

export const saveResultsToDb = async (jobId: string, results: TrackingResult[]) => {
    // Legacy function, might not be used with async flow but keeping for compatibility if needed
    // or if we ever save results in bulk.
    // For async flow, we use savePendingTasks and updateResultRow.
    console.warn("saveResultsToDb called in async architecture context - verify usage.");
};

// NEW: Helper to save initial pending rows
const savePendingTasks = async (tasks: any[]) => {
  const { error } = await supabase.from('results').insert(tasks);
  if (error) console.error('Error saving pending tasks:', error);
};

// NEW: Helper to update a single row when check is complete
const updateResultRow = async (serpapi_id: string, data: any) => {
  const { error } = await supabase.from('results').update({
    rank: data.rank,
    search_volume: data.search_volume,
    ai_present: data.ai_present,
    ai_content: data.ai_content,
    ai_sentiment: data.ai_sentiment,
    processing_status: 'complete'
  }).eq('serpapi_id', serpapi_id);

  if (error) console.error('Error updating result row:', error);
};

// --- The Main Logic: Orchestrator ---

export const createJob = async (
  targetUrl: string,
  queries: string[],
  location: string,
  device: 'desktop' | 'mobile',
  searchMode: string
): Promise<TrackingJob | null> => {
  // 1. Create Job Parent
  const jobId = await createJobInDb(targetUrl, queries, location, device, searchMode);
  if (!jobId) throw new Error("Failed to DB init");

  // 2. Start Async Processing (Fire & Forget from UI perspective)
  runAsyncWorkflow(jobId, targetUrl, queries, location, searchMode);

  return {
    id: jobId,
    targetUrl,
    queries,
    location,
    device,
    searchMode: searchMode as any,
    status: 'processing',
    progress: 0,
    createdAt: new Date().toISOString(),
    results: []
  };
};

const runAsyncWorkflow = async (jobId: string, targetUrl: string, queries: string[], location: string, searchMode: string) => {
  try {
    // Phase A: "Start" - Get Tickets
    const startRes = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, queries, location, searchMode })
    });

    if (!startRes.ok) throw new Error(`Start failed: ${startRes.statusText}`);

    const startData = await startRes.json();

    // Save Tickets to DB
    if (startData.tasks) {
      await savePendingTasks(startData.tasks);
    }

    // Phase B: "Check" - The Polling Loop
    let pending = [...(startData.tasks || [])];

    // Loop until all are processed
    while (pending.length > 0) {
      const currentTask = pending.shift(); // Take one

      const checkRes = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serpapi_id: currentTask.serpapi_id, targetUrl })
      });

      if (!checkRes.ok) {
          console.error("Check failed for", currentTask.serpapi_id);
          continue;
      }

      const checkData = await checkRes.json();

      if (checkData.status === 'complete') {
        // 1. Save data to DB
        await updateResultRow(currentTask.serpapi_id, checkData.data);
      } else if (checkData.status === 'processing') {
        // 2. Not ready? Put back in queue and wait a bit
        pending.push(currentTask);
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before next check
      } else {
        // Error case
        console.error('Task failed', currentTask);
        // We could update DB to failed status here
        await supabase.from('results').update({ processing_status: 'failed' }).eq('serpapi_id', currentTask.serpapi_id);
      }

      // Tiny delay to keep CPU usage low
      await new Promise(r => setTimeout(r, 500));
    }

    // Done!
    await markJobComplete(jobId);

  } catch (e) {
    console.error("Workflow failed", e);
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

  return jobs.map((j: any) => {
     // Calculate progress based on processing_status
     const totalResults = j.results ? j.results.length : 0;
     const completedResults = j.results ? j.results.filter((r: any) => r.processing_status === 'complete').length : 0;
     const progress = j.status === 'completed' ? 100 : (totalResults > 0 ? Math.round((completedResults / totalResults) * 100) : 0);

     return {
        id: j.id,
        targetUrl: j.target_url,
        queries: j.results ? j.results.map((r: any) => r.query) : [],
        location: j.location,
        device: j.device,
        searchMode: j.search_mode,
        status: j.status,
        progress: progress,
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
     };
  });
};

// Alias for compatibility
export const getJobs = getJobsFromDb;
