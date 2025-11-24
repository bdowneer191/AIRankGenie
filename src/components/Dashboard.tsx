import React, { useEffect, useState } from 'react';
import { TrackingJob } from '../types';
import { getJobs, deleteJob } from '../services/trackingService';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from './ui/Components';
import { 
  Clock, ArrowRight, BarChart3, Loader2, AlertCircle, Trash2, 
  TrendingUp, Activity, Search, Sparkles, Bot, RefreshCw
} from 'lucide-react';

interface DashboardProps {
  onViewJob: (job: TrackingJob) => void;
  onNewJob: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewJob, onNewJob }) => {
  const [jobs, setJobs] = useState<TrackingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total: 0, avgRank: 0, aiVisibility: 0 });

  const loadJobs = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const allJobs = await getJobs();
      setJobs(allJobs);

      // Calculate stats from completed jobs
      const completed = allJobs.filter(j => j.status === 'completed');
      const totalResults = completed.flatMap(j => j.results || []);
      const rankedResults = totalResults.filter(r => r.rank !== null);
      
      const avgRank = rankedResults.length 
        ? Math.round(rankedResults.reduce((acc, r) => acc + (r.rank || 0), 0) / rankedResults.length) 
        : 0;
      
      const aiPresent = totalResults.filter(r => r.aiOverview?.present).length;
      const visibility = totalResults.length ? Math.round((aiPresent / totalResults.length) * 100) : 0;

      setStats({
        total: completed.length,
        avgRank,
        aiVisibility: visibility
      });
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadJobs();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      const hasProcessing = jobs.some(j => j.status === 'processing' || j.status === 'queued');
      if (hasProcessing) {
        loadJobs(true);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this report? This cannot be undone.')) {
      const success = await deleteJob(jobId);
      if (success) {
        await loadJobs();
      }
    }
  };

  const handleRefresh = () => {
    loadJobs(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const activeJobs = jobs.filter(j => j.status === 'queued' || j.status === 'processing');
  const historyJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-primary tracking-tight">Dashboard</h2>
          <p className="text-gray-500 mt-1">Real-time SERP & AI visibility monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={onNewJob} className="shadow-lg shadow-blue-500/20 transition-transform hover:scale-105">
            + New Job
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-600">Completed Jobs</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats.total}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-xl text-purple-600">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-600">AI Visibility</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats.aiVisibility}%</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-600">Avg. Position</p>
              <h3 className="text-2xl font-bold text-gray-900">{stats.avgRank || 'N/A'}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> 
            Processing ({activeJobs.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeJobs.map(job => (
              <Card 
                key={job.id} 
                className="relative overflow-hidden border-primary/20 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => onViewJob(job)}
              >
                <div className="absolute top-0 left-0 h-1 bg-gray-100 w-full">
                  <div 
                    className="h-full bg-primary transition-all duration-500" 
                    style={{ width: `${job.progress || 5}%` }} 
                  />
                </div>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <Badge variant="default" className="animate-pulse">
                      {job.status === 'queued' ? 'Queued' : `${job.progress}%`}
                    </Badge>
                    <span className="text-xs text-gray-400 font-mono">#{job.id.slice(-6)}</span>
                  </div>
                  <CardTitle className="text-lg truncate mt-2" title={job.targetUrl}>
                    {job.targetUrl}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    {job.searchMode === 'google' && <Search className="w-3 h-3" />}
                    {job.searchMode === 'google_ai_mode' && <Sparkles className="w-3 h-3" />}
                    {job.searchMode === 'google_ask_ai' && <Bot className="w-3 h-3" />}
                    {job.queries.length} keyword{job.queries.length !== 1 ? 's' : ''}
                  </div>
                  <Button variant="outline" size="sm" className="w-full">
                    View Status
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Reports */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" /> 
          Recent Reports
        </h3>
        
        {historyJobs.length === 0 && activeJobs.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No reports yet</h3>
            <p className="text-gray-500 max-w-sm mx-auto mt-2 mb-6">
              Start tracking a website to see real-time ranking data. <strong>Limit: 5 keywords</strong>
            </p>
            <Button onClick={onNewJob}>Create your first report</Button>
          </div>
        )}

        <div className="grid gap-3">
          {historyJobs.slice(0, 10).map((job, i) => (
            <Card 
              key={job.id} 
              className="hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group animate-in slide-in-from-bottom-2 duration-500"
              style={{ animationDelay: `${i * 50}ms` }}
              onClick={() => onViewJob(job)}
            >
              <CardContent className="p-0">
                <div className="flex items-center p-4 sm:p-5 gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    job.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {job.status === 'completed' ? <BarChart3 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  </div>
                  
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <div>
                      <h4 className="font-semibold text-gray-900 truncate">{job.targetUrl}</h4>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        {job.searchMode === 'google_ai_mode' ? (
                          <span className="flex items-center gap-1 text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                            <Sparkles className="w-3 h-3"/> AI Mode
                          </span>
                        ) : job.searchMode === 'google_ask_ai' ? (
                          <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            <Bot className="w-3 h-3"/> Ask AI
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            <Search className="w-3 h-3"/> Standard
                          </span>
                        )}
                        <span>• {new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <div className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Keywords</div>
                      <div className="text-sm font-medium text-gray-700">{job.queries.length} tracked</div>
                    </div>

                    <div className="hidden md:block">
                      <div className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Results</div>
                      <div className="text-sm font-medium text-gray-700">
                        {job.rankedKeywords}/{job.totalKeywords} ranked
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
                    <button
                      onClick={(e) => handleDeleteJob(job.id, e)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                      title="Delete report"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
