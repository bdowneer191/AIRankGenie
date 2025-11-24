// ============================================================================
// ADVANCED TRACKING SERVICE - VERCEL HOBBY OPTIMIZED
// ============================================================================
// Handles: 10s timeout limits, rate limiting, async workflows, retry logic

import { supabase, supabaseHelpers } from '../lib/supabase';
import { TrackingJob, TrackingResult, SearchMode } from '../types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Vercel Hobby: 10s timeout limit
  MAX_EXECUTION_TIME: 8000, // 8s buffer for safety
  
  // CONSERVATIVE: Start with 1 keyword at a time
  START_BATCH_SIZE: 1,      // ONE query at a time
  CHECK_BATCH_SIZE: 1,       // Check ONE at a time
  
  // Retry & polling
  MAX_RETRIES: 3,
  CHECK_INTERVAL: 3000,      // 3s between checks
  MAX_POLL_TIME: 180000,     // 3min max polling time
  
  // Rate limiting
  REQUESTS_PER_MINUTE: 30,   // Very conservative
  REQUEST_DELAY: 2000,       // 2s between requests
  
  // Limits
  MAX_KEYWORDS_PER_JOB: 5,   // Hard limit for hobby tier
};

// ============================================================================
// HELPER: Rate Limiter (Simple Token Bucket)
// ============================================================================

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    // Refill tokens
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / (60000 / this.refillRate));
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }

    // Wait if no tokens available
    if (this.tokens <= 0) {
      const waitTime = (60000 / this.refillRate) - (now - this.lastRefill);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokens = 1;
    }

    this.tokens--;
  }
}

const rateLimiter = new RateLimiter(
  CONFIG.REQUESTS_PER_MINUTE, 
  CONFIG.REQUESTS_PER_MINUTE
);

// ============================================================================
// HELPER: Delay
// ============================================================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// HELPER: Retry with Exponential Backoff
// ============================================================================

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = CONFIG.MAX_RETRIES,
  context: string = 'operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`${context} failed (attempt ${attempt + 1}/${maxRetries}):`, error);
      
      if (attempt < maxRetries - 1) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 5000);
        await delay(backoffTime);
      }
    }
  }
  
  throw lastError || new Error(`${context} failed after ${maxRetries} attempts`);
}

// ============================================================================
// HELPER: Timeout Wrapper
// ============================================================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMsg: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
    )
  ]);
}

// ============================================================================
// CORE: Start Async Search (Phase 1)
// ============================================================================

async function startAsyncSearches(
  jobId: string,
  queries: string[],
  location: string,
  searchMode: SearchMode
): Promise<Array<{ query: string; serpapi_id: string; result_id: string }>> {
  const tasks: Array<{ query: string; serpapi_id: string; result_id: string }> = [];
  
  // Process in batches to avoid timeout
  for (let i = 0; i < queries.length; i += CONFIG.START_BATCH_SIZE) {
    const batch = queries.slice(i, i + CONFIG.START_BATCH_SIZE);
    
    await rateLimiter.acquire();
    
    try {
      const response = await withTimeout(
        fetch('/api/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            jobId, 
            queries: batch, 
            location, 
            searchMode 
          })
        }),
        CONFIG.MAX_EXECUTION_TIME,
        'Start API timeout'
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Start API failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (data.tasks && Array.isArray(data.tasks)) {
        // Save to database immediately
        const dbInserts = data.tasks.map((task: any) => ({
          job_id: jobId,
          query: task.query,
          serpapi_id: task.serpapi_id,
          processing_status: 'pending',
          ai_present: false,
        }));

        const { data: insertedResults, error } = await supabase
          .from('results')
          .insert(dbInserts)
          .select('id, query, serpapi_id');

        if (error) {
          console.error('Error saving pending tasks:', error);
        } else {
          tasks.push(...(insertedResults || []).map((r: any) => ({
            query: r.query,
            serpapi_id: r.serpapi_id,
            result_id: r.id
          })));
        }
      }

      // Small delay between batches
      if (i + CONFIG.START_BATCH_SIZE < queries.length) {
        await delay(CONFIG.REQUEST_DELAY);
      }

    } catch (error) {
      console.error(`Batch ${i}-${i + CONFIG.START_BATCH_SIZE} failed:`, error);
      // Continue with remaining batches
    }
  }

  return tasks;
}

// ============================================================================
// CORE: Check & Update Results (Phase 2)
// ============================================================================

async function checkAndUpdateResult(
  task: { query: string; serpapi_id: string; result_id: string },
  targetUrl: string
): Promise<boolean> {
  await rateLimiter.acquire();

  try {
    const response = await withTimeout(
      fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          serpapi_id: task.serpapi_id, 
          targetUrl 
        })
      }),
      CONFIG.MAX_EXECUTION_TIME,
      'Check API timeout'
    );

    if (!response.ok) {
      throw new Error(`Check API failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'complete') {
      // Update database
      await supabaseHelpers.updateResult(task.result_id, {
        rank: data.data.rank,
        url: targetUrl,
        search_volume: data.data.search_volume || 0,
        ai_present: data.data.ai_present || false,
        ai_content: data.data.ai_content || null,
        ai_sentiment: data.data.ai_sentiment || 'neutral',
        processing_status: 'complete'
      });
      
      return true; // Complete
    } else if (data.status === 'processing') {
      return false; // Still processing
    } else {
      // Failed
      await supabaseHelpers.updateResult(task.result_id, {
        processing_status: 'failed'
      });
      return true; // Mark as complete (failed)
    }

  } catch (error) {
    console.error(`Check failed for ${task.query}:`, error);
    return false; // Retry
  }
}

// ============================================================================
// CORE: Poll Until Complete (Smart Polling)
// ============================================================================

async function pollUntilComplete(
  tasks: Array<{ query: string; serpapi_id: string; result_id: string }>,
  targetUrl: string,
  jobId: string
): Promise<void> {
  let pending = [...tasks];
  const startTime = Date.now();
  let pollCount = 0;

  while (pending.length > 0) {
    // Safety: Check if we've exceeded max poll time
    if (Date.now() - startTime > CONFIG.MAX_POLL_TIME) {
      console.warn('Max poll time exceeded. Marking remaining as failed.');
      
      for (const task of pending) {
        await supabaseHelpers.updateResult(task.result_id, {
          processing_status: 'failed'
        });
      }
      break;
    }

    pollCount++;
    console.log(`Poll ${pollCount}: ${pending.length} tasks remaining`);

    // Process in batches
    const batchResults: boolean[] = [];
    
    for (let i = 0; i < pending.length; i += CONFIG.CHECK_BATCH_SIZE) {
      const batch = pending.slice(i, i + CONFIG.CHECK_BATCH_SIZE);
      
      const results = await Promise.all(
        batch.map(task => 
          retryWithBackoff(
            () => checkAndUpdateResult(task, targetUrl),
            2,
            `Check ${task.query}`
          ).catch(() => false) // Don't throw, just mark as incomplete
        )
      );

      batchResults.push(...results);

      // Update progress
      const totalTasks = tasks.length;
      const completedTasks = totalTasks - pending.length + batchResults.filter(r => r).length;
      const progress = Math.round((completedTasks / totalTasks) * 100);

      await supabaseHelpers.updateJobStatus(jobId, 'processing', progress);

      // Small delay between check batches
      if (i + CONFIG.CHECK_BATCH_SIZE < pending.length) {
        await delay(CONFIG.REQUEST_DELAY / 2);
      }
    }

    // Filter out completed tasks
    pending = pending.filter((_, idx) => !batchResults[idx]);

    // Wait before next poll round
    if (pending.length > 0) {
      await delay(CONFIG.CHECK_INTERVAL);
    }
  }
}

// ============================================================================
// MAIN: Create Job (Orchestrator)
// ============================================================================

export async function createJob(
  targetUrl: string,
  queries: string[],
  location: string,
  device: 'desktop' | 'mobile',
  searchMode: SearchMode
): Promise<TrackingJob | null> {
  console.log('🚀 Creating tracking job:', { targetUrl, queries: queries.length, searchMode });

  try {
    // HARD LIMIT: Max 5 keywords for Vercel Hobby
    if (queries.length > CONFIG.MAX_KEYWORDS_PER_JOB) {
      throw new Error(`Maximum ${CONFIG.MAX_KEYWORDS_PER_JOB} keywords allowed per job`);
    }

    if (queries.length === 0) {
      throw new Error('At least one keyword required');
    }

    // 1. Create job in database
    const job = await supabaseHelpers.createJob(
      targetUrl,
      queries,
      location,
      device,
      searchMode
    );

    if (!job) {
      throw new Error('Failed to create job in database');
    }

    console.log('✅ Job created:', job.id);

    // 2. Start async workflow (non-blocking)
    runAsyncWorkflow(job.id, targetUrl, queries, location, searchMode)
      .then(() => console.log('✅ Workflow completed:', job.id))
      .catch(err => console.error('❌ Workflow failed:', job.id, err));

    return job;

  } catch (error) {
    console.error('Error creating job:', error);
    return null;
  }
}

// ============================================================================
// WORKFLOW: Async Background Processing
// ============================================================================

async function runAsyncWorkflow(
  jobId: string,
  targetUrl: string,
  queries: string[],
  location: string,
  searchMode: SearchMode
): Promise<void> {
  console.log('🔄 Starting async workflow for job:', jobId);

  try {
    // Update job status
    await supabaseHelpers.updateJobStatus(jobId, 'processing', 0);

    // Phase 1: Start all searches (get SerpAPI IDs)
    console.log('📡 Phase 1: Starting searches...');
    const tasks = await startAsyncSearches(jobId, queries, location, searchMode);
    
    if (tasks.length === 0) {
      throw new Error('No tasks were created');
    }

    console.log(`✅ Started ${tasks.length} searches`);

    // Phase 2: Poll until all complete
    console.log('⏳ Phase 2: Polling for results...');
    await pollUntilComplete(tasks, targetUrl, jobId);

    // Mark job as complete
    await supabaseHelpers.updateJobStatus(jobId, 'completed', 100);
    console.log('🎉 Job completed:', jobId);

  } catch (error) {
    console.error('❌ Workflow error:', error);
    await supabaseHelpers.updateJobStatus(jobId, 'failed');
  }
}

// ============================================================================
// DATABASE: Get Jobs
// ============================================================================

export async function getJobs(): Promise<TrackingJob[]> {
  try {
    return await supabaseHelpers.getAllJobs(50);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }
}

// ============================================================================
// DATABASE: Get Single Job
// ============================================================================

export async function getJobById(jobId: string): Promise<TrackingJob | null> {
  try {
    return await supabaseHelpers.getJobById(jobId);
  } catch (error) {
    console.error('Error fetching job:', error);
    return null;
  }
}

// ============================================================================
// DATABASE: Delete Job
// ============================================================================

export async function deleteJob(jobId: string): Promise<boolean> {
  try {
    return await supabaseHelpers.deleteJob(jobId);
  } catch (error) {
    console.error('Error deleting job:', error);
    return false;
  }
}

// ============================================================================
// COMPATIBILITY: Legacy Functions
// ============================================================================

export const getJobsFromDb = getJobs;
export const clearAllJobs = async () => {
  console.warn('clearAllJobs is disabled for safety');
  return false;
};

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  createJob,
  getJobs,
  getJobById,
  deleteJob,
  getJobsFromDb,
  clearAllJobs,
};
