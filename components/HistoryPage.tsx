import React from 'react';
import { TrackingJob } from '../types';
import { getJobs, clearAllJobs } from '../services/simulationService';
import { Card, CardContent, Button } from './ui/Components';
import { Calendar, Trash2, ExternalLink } from 'lucide-react';

interface HistoryPageProps {
  onViewJob: (job: TrackingJob) => void;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ onViewJob }) => {
  const [jobs, setJobs] = React.useState<TrackingJob[]>([]);

  React.useEffect(() => {
    setJobs(getJobs());
  }, []);

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete all history? This cannot be undone.')) {
      clearAllJobs();
      setJobs([]);
    }
  };

  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

  // Group by date
  const groupedByDate = completedJobs.reduce((acc, job) => {
    const date = new Date(job.createdAt).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(job);
    return acc;
  }, {} as Record<string, TrackingJob[]>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-primary">History</h2>
          <p className="text-gray-500 mt-1">View all past tracking reports</p>
        </div>
        {completedJobs.length > 0 && (
          <Button variant="outline" onClick={handleClearAll} className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="w-4 h-4 mr-2" /> Clear All
          </Button>
        )}
      </div>

      {completedJobs.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No history yet. Start tracking to see results here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByDate).map(([date, dateJobs]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {date}
              </h3>
              <div className="space-y-2">
                {dateJobs.map(job => (
                  <Card
                    key={job.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => onViewJob(job)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{job.targetUrl}</p>
                        <p className="text-sm text-gray-500">
                          {job.queries.length} keywords • {job.location} •
                          {new Date(job.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          job.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {job.status}
                        </span>
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
