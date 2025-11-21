import React, { useEffect, useState } from 'react';
import { TrackingJob } from '../types';
import { getJobs } from '../services/simulationService';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from './ui/Components';
import { Clock, ArrowRight, BarChart3, Loader2, AlertCircle } from 'lucide-react';

interface DashboardProps {
  onViewJob: (job: TrackingJob) => void;
  onNewJob: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewJob, onNewJob }) => {
  const [jobs, setJobs] = useState<TrackingJob[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setJobs(getJobs());
    }, 1000);
    setJobs(getJobs());
    return () => clearInterval(interval);
  }, []);

  const safeJobs = jobs || [];
  const activeJobs = safeJobs.filter(j => j.status === 'queued' || j.status === 'processing');
  const completedJobs = safeJobs.filter(j => j.status === 'completed' || j.status === 'failed');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-primary tracking-tight">Dashboard</h2>
          <p className="text-gray-500 mt-1">Overview of your rank tracking performance.</p>
        </div>
        <Button onClick={onNewJob} className="shadow-lg shadow-primary/20">
          + New Job
        </Button>
      </div>

      {/* Active Jobs Section */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Processing
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeJobs.map(job => (
              <Card key={job.id} className="relative overflow-hidden border-primary/20 shadow-md">
                 <div className="absolute top-0 left-0 h-1 bg-gray-100 w-full">
                   <div className="h-full bg-primary transition-all duration-500" style={{ width: `${job.progress}%` }} />
                 </div>
                 <CardHeader className="pb-2">
                   <div className="flex justify-between items-start">
                     <Badge variant="default">Processing {job.progress}%</Badge>
                     <span className="text-xs text-gray-400 font-mono">#{job.id.slice(-6)}</span>
                   </div>
                   <CardTitle className="text-lg truncate mt-2" title={job.targetUrl}>
                     {job.targetUrl}
                   </CardTitle>
                 </CardHeader>
                 <CardContent>
                   <p className="text-sm text-gray-500 mb-4">
                     Checking {job.queries.length} keywords...
                   </p>
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="w-full" 
                     onClick={() => onViewJob(job)}
                   >
                     View Live Status
                   </Button>
                 </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent History Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" /> Recent Reports
        </h3>
        
        {completedJobs.length === 0 && activeJobs.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No reports yet</h3>
            <p className="text-gray-500 max-w-sm mx-auto mt-2 mb-6">
              Start tracking a website to see real-time ranking data and AI insights.
            </p>
            <Button onClick={onNewJob}>Create your first report</Button>
          </div>
        )}

        <div className="grid gap-4">
          {completedJobs.map(job => (
            <Card key={job.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => onViewJob(job)}>
              <CardContent className="p-0">
                <div className="flex items-center p-4 sm:p-6 gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${job.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {job.status === 'completed' ? <BarChart3 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                       <h4 className="font-semibold text-gray-900 truncate">{job.targetUrl}</h4>
                       <span className="text-xs text-gray-400">{new Date(job.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{job.queries.length} Keywords</span>
                      <span className="w-1 h-1 bg-gray-300 rounded-full" />
                      <span>{job.location}</span>
                    </div>
                  </div>

                  <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
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