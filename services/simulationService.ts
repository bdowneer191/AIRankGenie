import { TrackingJob, TrackingResult, CompetitorResult, MockSerpResponse } from "../types";

// Simulates a database of jobs
let jobsStore: TrackingJob[] = [];

export const getJobs = (): TrackingJob[] => {
  return [...jobsStore].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const createJob = (
  targetUrl: string, 
  queries: string[], 
  location: string, 
  device: 'desktop' | 'mobile'
): TrackingJob => {
  const newJob: TrackingJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    targetUrl,
    queries,
    location,
    device,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
    results: []
  };
  jobsStore.push(newJob);
  
  // Start background simulation
  simulateJobProcessing(newJob.id);
  
  return newJob;
};

const simulateJobProcessing = (jobId: string) => {
  // Initial delay to simulate queue
  setTimeout(() => {
    updateJobStatus(jobId, 'processing', 5);
    
    const job = jobsStore.find(j => j.id === jobId);
    if (!job) return;

    let processed = 0;
    const total = job.queries.length;
    const results: TrackingResult[] = [];

    const processNextQuery = (index: number) => {
      if (index >= total) {
        updateJobComplete(jobId, results);
        return;
      }

      const query = job.queries[index];
      
      // Simulate API latency (1-3 seconds per query)
      setTimeout(() => {
        const mockResult = generateMockSerpResult(query, job.targetUrl);
        results.push(mockResult);
        processed++;
        const progress = Math.round((processed / total) * 100);
        updateJobStatus(jobId, 'processing', progress);
        
        processNextQuery(index + 1);
      }, 1500 + Math.random() * 1500);
    };

    processNextQuery(0);

  }, 2000);
};

const updateJobStatus = (id: string, status: TrackingJob['status'], progress: number) => {
  const idx = jobsStore.findIndex(j => j.id === id);
  if (idx !== -1) {
    jobsStore[idx] = { ...jobsStore[idx], status, progress };
  }
};

const updateJobComplete = (id: string, results: TrackingResult[]) => {
  const idx = jobsStore.findIndex(j => j.id === id);
  if (idx !== -1) {
    jobsStore[idx] = { 
      ...jobsStore[idx], 
      status: 'completed', 
      progress: 100, 
      results,
      completedAt: new Date().toISOString()
    };
  }
};

// --- Mock Data Generator ---

const generateMockHistory = (currentRank: number | null) => {
  const history = [];
  const days = 14; // 2 weeks history
  let lastRank = currentRank;
  
  // If current rank is null, assume we were around 50 or null before
  if (lastRank === null) lastRank = Math.random() > 0.5 ? 50 : null;

  for (let i = days; i > 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    let rank: number | null = null;

    if (lastRank !== null) {
      // Random fluctuation +/- 3
      const change = Math.floor(Math.random() * 7) - 3;
      rank = lastRank + change;
      if (rank < 1) rank = 1;
      if (rank > 100) rank = null; // Drop out
    } else {
      // Chance to come back in
      if (Math.random() > 0.8) rank = 80 + Math.floor(Math.random() * 20);
    }

    history.push({
      date: date.toISOString().split('T')[0],
      rank: rank
    });
    
    if (rank) lastRank = rank;
  }
  
  // Add current (today)
  history.push({
    date: new Date().toISOString().split('T')[0],
    rank: currentRank
  });
  
  return history;
};

const generateMockSerpResult = (query: string, targetUrl: string): TrackingResult => {
  // Deterministic pseudo-randomness based on query length
  const isAiOverview = query.length % 2 === 0;
  const rank = Math.random() > 0.3 ? Math.floor(Math.random() * 20) + 1 : null; // 70% chance to rank
  
  const competitors: CompetitorResult[] = [
    { rank: 1, title: "Wikipedia - " + query, url: "https://wikipedia.org/wiki/" + query.replace(/ /g, '_'), snippet: "Detailed information about " + query },
    { rank: 2, title: "Best " + query + " Guide 2024", url: "https://example.com/guide", snippet: "The ultimate guide to..." },
    { rank: 3, title: "Top 10 " + query + " Tips", url: "https://competitor.com/tips", snippet: "Learn how to..." },
    { rank: 4, title: "Reddit Discussion: " + query, url: "https://reddit.com/r/topic", snippet: "Community discussion about..." },
    { rank: 5, title: "Youtube Video: " + query, url: "https://youtube.com/watch?v=123", snippet: "Watch this video..." },
  ];

  // Insert target if ranked
  if (rank && rank <= 5) {
    competitors[rank - 1] = { 
      rank, 
      title: "My Target Page for " + query, 
      url: targetUrl + "/page", 
      snippet: "Our awesome content about " + query 
    };
  }

  // Generate diverse SERP features
  const possibleFeatures = ["People Also Ask", "Local Pack", "Featured Snippet", "Video", "Image Pack", "Shopping Results", "Top Stories", "Knowledge Panel", "Sitelinks"];
  const extraFeatures = possibleFeatures.filter(() => Math.random() > 0.75); // Randomly add some features

  let serpFeatures = isAiOverview ? ["AI Overview"] : ["Organic"];
  // Deduplicate "Organic" if we have other rich features for variety, but typically Organic is always there.
  // Let's just merge them.
  serpFeatures = [...new Set([...serpFeatures, ...extraFeatures])];

  return {
    query,
    rank,
    url: targetUrl,
    history: generateMockHistory(rank),
    aiOverview: {
      present: isAiOverview,
      content: isAiOverview ? `Here is a summary of ${query}. Ideally, this provides a quick answer to the user's question based on top web results.` : undefined
    },
    serpFeatures: serpFeatures,
    competitors
  };
};