/// <reference types="vite/client" />

// ============================================================================
// ENHANCED SUPABASE CLIENT WITH TYPE SAFETY & HELPERS
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  TrackingJob,
  TrackingResult,
  DBJob,
  DBResult,
  DBCitation,
  AIcitation,
  SearchMode,
  JobStatus
} from '../types';

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  console.error('Please check your .env.local file');
}

// ============================================================================
// SUPABASE CLIENT INITIALIZATION
// ============================================================================

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', // Fallback to prevent crashes
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false, // We're not using auth for MVP
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'x-application-name': 'ai-rank-tracker',
      },
    },
  }
);

// Check connection health
const checkSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('jobs').select('id').limit(1);
    if (error) {
      console.error('Supabase connection error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase connection failed:', err);
    return false;
  }
};

// Run health check on load (non-blocking)
checkSupabaseConnection().then(isHealthy => {
  if (isHealthy) {
    console.log('✅ Supabase connected successfully');
  } else {
    console.warn('⚠️ Supabase connection issue detected');
  }
});

// ============================================================================
// DATABASE HELPER FUNCTIONS
// ============================================================================

/**
 * JOB OPERATIONS
 */

export const supabaseHelpers = {
  
  // --------------------------------------------------------------------------
  // CREATE JOB
  // --------------------------------------------------------------------------
  async createJob(
    targetUrl: string,
    queries: string[],
    location: string = 'United States',
    device: 'desktop' | 'mobile' = 'desktop',
    searchMode: SearchMode = 'google'
  ): Promise<TrackingJob | null> {
    try {
      const jobData: Partial<DBJob> = {
        target_url: targetUrl,
        location,
        device,
        search_mode: searchMode,
        status: 'queued',
        created_at: new Date().toISOString(),
      };

      const { data: job, error } = await supabase
        .from('jobs')
        .insert(jobData)
        .select()
        .single();

      if (error) {
        console.error('Error creating job:', error);
        return null;
      }

      // Create result entries for each query
      const resultPromises = queries.map(query =>
        supabase.from('results').insert({
          job_id: job.id,
          query,
          rank: null,
          url: '',
          search_volume: 0,
          ai_present: false,
          processing_status: 'pending',
          created_at: new Date().toISOString(),
        })
      );

      await Promise.all(resultPromises);

      // Convert DB format to app format
      return this.convertDBJobToTrackingJob(job, queries);
      
    } catch (err) {
      console.error('Exception creating job:', err);
      return null;
    }
  },

  // --------------------------------------------------------------------------
  // GET JOB BY ID (with all results)
  // --------------------------------------------------------------------------
  async getJobById(jobId: string): Promise<TrackingJob | null> {
    try {
      // Fetch job
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError || !job) {
        console.error('Error fetching job:', jobError);
        return null;
      }

      // Fetch all results for this job
      const { data: results, error: resultsError } = await supabase
        .from('results')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (resultsError) {
        console.error('Error fetching results:', resultsError);
        return null;
      }

      // Fetch citations for all results
      const resultIds = results?.map(r => r.id) || [];
      const { data: citations } = await supabase
        .from('citations')
        .select('*')
        .in('result_id', resultIds);

      // Build TrackingJob object
      return this.buildTrackingJobFromDB(job, results || [], citations || []);
      
    } catch (err) {
      console.error('Exception fetching job:', err);
      return null;
    }
  },

  // --------------------------------------------------------------------------
  // GET ALL JOBS
  // --------------------------------------------------------------------------
  async getAllJobs(limit: number = 50): Promise<TrackingJob[]> {
    try {
      const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !jobs) {
        console.error('Error fetching jobs:', error);
        return [];
      }

      // For each job, fetch basic stats (not full results for performance)
      const jobsWithStats = await Promise.all(
        jobs.map(async (job) => {
          const { data: results } = await supabase
            .from('results')
            .select('id, query, rank, ai_present')
            .eq('job_id', job.id);

          return this.buildTrackingJobFromDB(job, results || [], []);
        })
      );

      return jobsWithStats;
      
    } catch (err) {
      console.error('Exception fetching all jobs:', err);
      return [];
    }
  },

  // --------------------------------------------------------------------------
  // UPDATE JOB STATUS
  // --------------------------------------------------------------------------
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number
  ): Promise<boolean> {
    try {
      const updates: Partial<DBJob> = { status };
      
      if (status === 'completed' || status === 'failed') {
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', jobId);

      if (error) {
        console.error('Error updating job status:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Exception updating job status:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // UPDATE RESULT (after SERP processing)
  // --------------------------------------------------------------------------
  async updateResult(
    resultId: string,
    data: {
      rank?: number | null;
      url?: string;
      search_volume?: number;
      ai_present?: boolean;
      ai_content?: string;
      ai_sentiment?: string;
      processing_status?: 'pending' | 'complete' | 'failed';
      serpapi_id?: string;
    }
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('results')
        .update(data)
        .eq('id', resultId);

      if (error) {
        console.error('Error updating result:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Exception updating result:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // SAVE AI CITATIONS
  // --------------------------------------------------------------------------
  async saveCitations(
    resultId: string,
    citations: AIcitation[]
  ): Promise<boolean> {
    try {
      // Delete existing citations
      await supabase.from('citations').delete().eq('result_id', resultId);

      // Insert new citations
      const citationData = citations.map(c => ({
        result_id: resultId,
        position: c.position,
        url: c.url,
        domain: c.domain,
        title: c.title,
        snippet: c.snippet,
        is_user_domain: c.isUserDomain,
        is_competitor: c.isCompetitor,
      }));

      const { error } = await supabase
        .from('citations')
        .insert(citationData);

      if (error) {
        console.error('Error saving citations:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Exception saving citations:', err);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // GET PENDING RESULTS (for async polling)
  // --------------------------------------------------------------------------
  async getPendingResults(): Promise<Array<{ id: string; serpapi_id: string; job_id: string }>> {
    try {
      const { data, error } = await supabase
        .from('results')
        .select('id, serpapi_id, job_id')
        .eq('processing_status', 'pending')
        .not('serpapi_id', 'is', null);

      if (error) {
        console.error('Error fetching pending results:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Exception fetching pending results:', err);
      return [];
    }
  },

  // --------------------------------------------------------------------------
  // DELETE JOB (cascade delete results & citations)
  // --------------------------------------------------------------------------
  async deleteJob(jobId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobId);

      if (error) {
        console.error('Error deleting job:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Exception deleting job:', err);
      return false;
    }
  },

  // ============================================================================
  // HELPER: Convert DB Job to TrackingJob
  // ============================================================================
  convertDBJobToTrackingJob(
    dbJob: DBJob,
    queries: string[]
  ): TrackingJob {
    return {
      id: dbJob.id,
      targetUrl: dbJob.target_url,
      queries,
      location: dbJob.location,
      device: dbJob.device as 'desktop' | 'mobile',
      searchMode: dbJob.search_mode,
      status: dbJob.status,
      progress: 0,
      createdAt: dbJob.created_at,
      completedAt: dbJob.completed_at,
      results: [],
      totalKeywords: queries.length,
      rankedKeywords: 0,
      aiFeatureCount: 0,
    };
  },

  // ============================================================================
  // HELPER: Build TrackingJob from DB data
  // ============================================================================
  buildTrackingJobFromDB(
    dbJob: DBJob,
    dbResults: DBResult[],
    dbCitations: DBCitation[]
  ): TrackingJob {
    const results: TrackingResult[] = dbResults.map(dbResult => {
      // Find citations for this result
      const resultCitations: AIcitation[] = dbCitations
        .filter(c => c.result_id === dbResult.id)
        .map(c => ({
          position: c.position,
          url: c.url,
          domain: c.domain,
          title: c.title,
          snippet: c.snippet,
          isUserDomain: c.is_user_domain,
          isCompetitor: c.is_competitor,
          prominence: 'secondary' as const,
        }));

      const userCitation = resultCitations.find(c => c.isUserDomain);

      return {
        query: dbResult.query,
        rank: dbResult.rank,
        url: dbResult.url || '',
        searchVolume: dbResult.search_volume,
        history: [], // TODO: Implement history tracking
        aiOverview: {
          present: dbResult.ai_present,
          type: dbResult.ai_present ? 'standard' : 'none',
          content: dbResult.ai_content,
          sentiment: dbResult.ai_sentiment as any,
          citations: resultCitations,
          userDomainCited: !!userCitation,
          userDomainPosition: userCitation?.position,
          citationCount: resultCitations.length,
        },
        serpFeatures: [], // TODO: Track SERP features
        competitors: [], // TODO: Track competitors
        processingStatus: dbResult.processing_status as any,
        serpapiId: dbResult.serpapi_id,
        lastChecked: dbResult.created_at,
      };
    });

    const rankedKeywords = results.filter(r => r.rank !== null).length;
    const aiFeatureCount = results.filter(r => r.aiOverview.present).length;
    const totalKeywords = results.length;

    // Calculate progress
    const completedResults = results.filter(
      r => r.processingStatus === 'complete' || r.processingStatus === 'failed'
    ).length;
    const progress = totalKeywords > 0 
      ? Math.round((completedResults / totalKeywords) * 100) 
      : 0;

    return {
      id: dbJob.id,
      targetUrl: dbJob.target_url,
      queries: results.map(r => r.query),
      location: dbJob.location,
      device: dbJob.device as 'desktop' | 'mobile',
      searchMode: dbJob.search_mode,
      status: dbJob.status,
      progress,
      createdAt: dbJob.created_at,
      completedAt: dbJob.completed_at,
      results,
      totalKeywords,
      rankedKeywords,
      aiFeatureCount,
      averageRank: rankedKeywords > 0
        ? results.reduce((sum, r) => sum + (r.rank || 0), 0) / rankedKeywords
        : undefined,
    };
  },
};

// ============================================================================
// REALTIME SUBSCRIPTIONS (Optional - for live updates)
// ============================================================================

export const subscribeToJob = (
  jobId: string,
  callback: (job: TrackingJob) => void
) => {
  const channel = supabase
    .channel(`job-${jobId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      },
      async (payload) => {
        console.log('Job updated:', payload);
        const job = await supabaseHelpers.getJobById(jobId);
        if (job) callback(job);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default supabase;
