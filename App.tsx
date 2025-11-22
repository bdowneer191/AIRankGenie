import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, Sparkles, AlertCircle, BarChart3, Activity, Search, Bot, Target, Zap, Eye, ThumbsUp, ThumbsDown, Calendar } from 'lucide-react';

// Types
interface TrackingResult {
  query: string;
  rank: number | null;
  url: string;
  history: { date: string; rank: number | null; searchVolume?: number }[];
  aiOverview: {
    present: boolean;
    content?: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
    sentimentScore?: number;
  };
  serpFeatures: string[];
  competitors: { rank: number; title: string; url: string }[];
  searchVolume?: number;
  sov?: number;
}

interface TrackingJob {
  id: string;
  targetUrl: string;
  queries: string[];
  searchMode: 'google' | 'google_ai_mode' | 'google_ask_ai';
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  results: TrackingResult[];
  createdAt: string;
  completedAt?: string;
  volatilityIndex?: number;
}

// Sentiment Analysis
const analyzeSentiment = (text: string, brandName: string): { sentiment: 'positive' | 'negative' | 'neutral', score: number } => {
  const positiveWords = ['best', 'top', 'excellent', 'great', 'leading', 'innovative', 'trusted', 'recommended', 'quality', 'superior'];
  const negativeWords = ['worst', 'poor', 'bad', 'outdated', 'unreliable', 'problem', 'issue', 'complaint', 'avoid'];
  
  const lowerText = text.toLowerCase();
  const hasBrand = lowerText.includes(brandName.toLowerCase());
  
  if (!hasBrand) return { sentiment: 'neutral', score: 0 };
  
  let score = 0;
  positiveWords.forEach(word => {
    if (lowerText.includes(word)) score += 1;
  });
  negativeWords.forEach(word => {
    if (lowerText.includes(word)) score -= 1;
  });
  
  const sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  return { sentiment, score: Math.abs(score) };
};

// Share of Voice Calculation
const calculateSoV = (rank: number | null, searchVolume: number = 1000): number => {
  if (!rank || rank > 100) return 0;
  
  // CTR curve based on position
  const ctrCurve: { [key: number]: number } = {
    1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.07,
    6: 0.05, 7: 0.04, 8: 0.03, 9: 0.03, 10: 0.02
  };
  
  const ctr = ctrCurve[rank] || (rank <= 20 ? 0.01 : 0.005);
  return Math.round(searchVolume * ctr);
};

// Volatility Index
const calculateVolatility = (results: TrackingResult[]): number => {
  if (results.length < 2) return 0;
  
  let totalChange = 0;
  let count = 0;
  
  results.forEach(result => {
    if (result.history.length >= 2) {
      const recent = result.history.slice(-2);
      const change = Math.abs((recent[1].rank || 0) - (recent[0].rank || 0));
      totalChange += change;
      count++;
    }
  });
  
  return count > 0 ? Math.round((totalChange / count) * 10) : 0;
};

// Main Component
const RankTrackerApp = () => {
  const [jobs, setJobs] = useState<TrackingJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<TrackingJob | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [searchMode, setSearchMode] = useState<'google' | 'google_ai_mode' | 'google_ask_ai'>('google');
  const [isTracking, setIsTracking] = useState(false);

  // Load jobs from storage
  useEffect(() => {
    const stored = localStorage.getItem('rankTrackerJobs');
    if (stored) {
      try {
        setJobs(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load jobs', e);
      }
    }
  }, []);

  // Save jobs to storage
  useEffect(() => {
    localStorage.setItem('rankTrackerJobs', JSON.stringify(jobs));
  }, [jobs]);

  // Poll for job updates
  useEffect(() => {
    const interval = setInterval(() => {
      const processingJobs = jobs.filter(j => j.status === 'processing');
      if (processingJobs.length > 0) {
        // Trigger re-render to show updates
        setJobs([...jobs]);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [jobs]);

  const startTracking = async () => {
    if (!targetUrl || !keywords) return;
    
    const queryList = keywords.split('\n').map(k => k.trim()).filter(Boolean);
    if (queryList.length === 0) return;
    
    setIsTracking(true);
    
    const jobId = `job_${Date.now()}`;
    const newJob: TrackingJob = {
      id: jobId,
      targetUrl,
      queries: queryList,
      searchMode,
      status: 'processing',
      progress: 0,
      results: [],
      createdAt: new Date().toISOString()
    };
    
    setJobs([newJob, ...jobs]);
    setSelectedJob(newJob);
    
    // Process in batches to avoid timeout
    const BATCH_SIZE = 2; // Small batches to stay under 10s limit
    let allResults: TrackingResult[] = [];
    
    for (let i = 0; i < queryList.length; i += BATCH_SIZE) {
      const batch = queryList.slice(i, i + BATCH_SIZE);
      
      try {
        const response = await fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl,
            queries: batch,
            location: 'United States',
            device: 'desktop',
            searchMode
          })
        });
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        const batchResults = data.results || [];
        
        // Add sentiment analysis and SoV
        const enhancedResults = batchResults.map((result: TrackingResult) => {
          const sentiment = result.aiOverview.content 
            ? analyzeSentiment(result.aiOverview.content, targetUrl)
            : { sentiment: 'neutral' as const, score: 0 };
          
          const sov = calculateSoV(result.rank, result.searchVolume);
          
          return {
            ...result,
            aiOverview: {
              ...result.aiOverview,
              sentiment: sentiment.sentiment,
              sentimentScore: sentiment.score
            },
            sov,
            history: [{ date: new Date().toISOString(), rank: result.rank, searchVolume: result.searchVolume }]
          };
        });
        
        allResults = [...allResults, ...enhancedResults];
        
        // Update progress
        const progress = Math.round(((i + batch.length) / queryList.length) * 100);
        const volatilityIndex = calculateVolatility(allResults);
        
        setJobs(prev => prev.map(j => 
          j.id === jobId 
            ? { ...j, progress, results: allResults, volatilityIndex, status: progress === 100 ? 'completed' : 'processing', completedAt: progress === 100 ? new Date().toISOString() : undefined }
            : j
        ));
        
        if (selectedJob?.id === jobId) {
          setSelectedJob(prev => prev ? { ...prev, progress, results: allResults, volatilityIndex } : null);
        }
        
      } catch (error) {
        console.error('Batch failed:', error);
      }
    }
    
    setIsTracking(false);
  };

  // Calculate aggregate metrics
  const getMetrics = (job: TrackingJob) => {
    if (!job.results.length) return null;
    
    const totalSoV = job.results.reduce((sum, r) => sum + (r.sov || 0), 0);
    const avgRank = job.results.filter(r => r.rank).reduce((sum, r) => sum + (r.rank || 0), 0) / job.results.filter(r => r.rank).length || 0;
    const aiVisibility = (job.results.filter(r => r.aiOverview.present).length / job.results.length) * 100;
    const positiveSentiment = job.results.filter(r => r.aiOverview.sentiment === 'positive').length;
    const negativeSentiment = job.results.filter(r => r.aiOverview.sentiment === 'negative').length;
    
    return { totalSoV, avgRank, aiVisibility, positiveSentiment, negativeSentiment };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">AI Rank Tracker Pro</h1>
              <p className="text-gray-500">Real-time SERP monitoring with AI insights</p>
            </div>
          </div>
        </div>

        {!selectedJob ? (
          // Input Form
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Start New Tracking</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Target Website</label>
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="example.com"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Keywords (one per line)</label>
                <textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="keyword 1&#10;keyword 2&#10;keyword 3"
                  rows={6}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Search Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'google', label: 'Standard', icon: Search },
                    { value: 'google_ai_mode', label: 'AI Mode', icon: Sparkles },
                    { value: 'google_ask_ai', label: 'Ask AI', icon: Bot }
                  ].map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => setSearchMode(mode.value as any)}
                      className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all ${
                        searchMode === mode.value
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <mode.icon className="w-4 h-4" />
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <button
                onClick={startTracking}
                disabled={isTracking || !targetUrl || !keywords}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-lg font-semibold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isTracking ? (
                  <>
                    <Activity className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    Start Tracking
                  </>
                )}
              </button>
            </div>
            
            {/* Recent Jobs */}
            {jobs.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Reports</h3>
                <div className="space-y-2">
                  {jobs.slice(0, 5).map(job => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-gray-900">{job.targetUrl}</div>
                        <div className="text-sm text-gray-500">{job.queries.length} keywords • {new Date(job.createdAt).toLocaleString()}</div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        job.status === 'completed' ? 'bg-green-100 text-green-700' :
                        job.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {job.status === 'processing' ? `${job.progress}%` : job.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          // Results Dashboard
          <div className="space-y-6">
            <button
              onClick={() => setSelectedJob(null)}
              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
            >
              ← Back to Dashboard
            </button>
            
            {(() => {
              const metrics = getMetrics(selectedJob);
              if (!metrics) return null;
              
              return (
                <>
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MetricCard
                      icon={Eye}
                      label="Share of Voice"
                      value={metrics.totalSoV.toLocaleString()}
                      color="blue"
                    />
                    <MetricCard
                      icon={Target}
                      label="Avg Position"
                      value={metrics.avgRank.toFixed(1)}
                      color="purple"
                    />
                    <MetricCard
                      icon={Sparkles}
                      label="AI Visibility"
                      value={`${metrics.aiVisibility.toFixed(0)}%`}
                      color="indigo"
                    />
                    <MetricCard
                      icon={ThumbsUp}
                      label="Positive Mentions"
                      value={metrics.positiveSentiment}
                      color="green"
                    />
                    <MetricCard
                      icon={Activity}
                      label="Volatility Index"
                      value={selectedJob.volatilityIndex || 0}
                      color="amber"
                    />
                  </div>
                  
                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Ranking Distribution */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Ranking Distribution</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={selectedJob.results.filter(r => r.rank).map(r => ({ query: r.query.substring(0, 20), rank: r.rank }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="query" angle={-45} textAnchor="end" height={100} fontSize={12} />
                          <YAxis reversed domain={[0, 100]} />
                          <Tooltip />
                          <Bar dataKey="rank" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    
                    {/* Share of Voice */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Share of Voice by Keyword</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={selectedJob.results.filter(r => r.sov).slice(0, 10).map(r => ({ query: r.query.substring(0, 20), sov: r.sov }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="query" angle={-45} textAnchor="end" height={100} fontSize={12} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="sov" fill="#8b5cf6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Sentiment Analysis */}
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">AI Overview Sentiment</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <SentimentCard sentiment="positive" count={metrics.positiveSentiment} total={selectedJob.results.length} />
                      <SentimentCard sentiment="neutral" count={selectedJob.results.length - metrics.positiveSentiment - metrics.negativeSentiment} total={selectedJob.results.length} />
                      <SentimentCard sentiment="negative" count={metrics.negativeSentiment} total={selectedJob.results.length} />
                    </div>
                  </div>
                  
                  {/* Detailed Results */}
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Keyword Details</h3>
                    <div className="space-y-3">
                      {selectedJob.results.map((result, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">{result.query}</div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                <span>Rank: {result.rank || 'Not ranked'}</span>
                                <span>SoV: {result.sov?.toLocaleString() || 0}</span>
                                {result.aiOverview.present && (
                                  <span className="flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    AI Overview
                                  </span>
                                )}
                              </div>
                            </div>
                            {result.aiOverview.sentiment && (
                              <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                result.aiOverview.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                                result.aiOverview.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {result.aiOverview.sentiment}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper Components
const MetricCard = ({ icon: Icon, label, value, color }: any) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <div className={`w-10 h-10 rounded-lg bg-${color}-100 flex items-center justify-center mb-3`}>
      <Icon className={`w-5 h-5 text-${color}-600`} />
    </div>
    <div className="text-3xl font-bold text-gray-900">{value}</div>
    <div className="text-sm text-gray-500 mt-1">{label}</div>
  </div>
);

const SentimentCard = ({ sentiment, count, total }: any) => {
  const percentage = ((count / total) * 100).toFixed(0);
  const colors = {
    positive: { bg: 'bg-green-100', text: 'text-green-700', icon: ThumbsUp },
    neutral: { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertCircle },
    negative: { bg: 'bg-red-100', text: 'text-red-700', icon: ThumbsDown }
  };
  const config = colors[sentiment as keyof typeof colors];
  
  return (
    <div className={`${config.bg} rounded-lg p-4`}>
      <config.icon className={`w-6 h-6 ${config.text} mb-2`} />
      <div className={`text-2xl font-bold ${config.text}`}>{count}</div>
      <div className="text-sm text-gray-600">{sentiment} ({percentage}%)</div>
    </div>
  );
};

export default RankTrackerApp;
