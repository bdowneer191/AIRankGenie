import React from 'react';
import { getJobs } from '../services/simulationService';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Components';
import { TrendingUp, Target, Sparkles, Award } from 'lucide-react';

const AnalyticsPage: React.FC = () => {
  const jobs = getJobs().filter(j => j.status === 'completed');

  // Calculate metrics
  const totalKeywords = jobs.reduce((sum, j) => sum + j.queries.length, 0);
  const allResults = jobs.flatMap(j => j.results || []);

  const rankedResults = allResults.filter(r => r.rank !== null);
  const top10Results = allResults.filter(r => r.rank && r.rank <= 10);
  const top3Results = allResults.filter(r => r.rank && r.rank <= 3);
  const aiOverviewResults = allResults.filter(r => r.aiOverview?.present);

  const avgRank = rankedResults.length > 0
    ? Math.round(rankedResults.reduce((sum, r) => sum + (r.rank || 0), 0) / rankedResults.length)
    : null;

  const metrics = [
    {
      title: 'Total Keywords Tracked',
      value: totalKeywords,
      icon: Target,
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    {
      title: 'Top 10 Rankings',
      value: `${top10Results.length}/${allResults.length}`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
    },
    {
      title: 'AI Overview Appearances',
      value: aiOverviewResults.length,
      icon: Sparkles,
      color: 'text-purple-600',
      bg: 'bg-purple-50'
    },
    {
      title: 'Top 3 Rankings',
      value: top3Results.length,
      icon: Award,
      color: 'text-amber-600',
      bg: 'bg-amber-50'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-primary">Analytics</h2>
        <p className="text-gray-500 mt-1">Overview of your tracking performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg ${metric.bg} flex items-center justify-center`}>
                  <metric.icon className={`w-6 h-6 ${metric.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                  <p className="text-sm text-gray-500">{metric.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {avgRank && (
        <Card>
          <CardHeader>
            <CardTitle>Average Ranking Position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <span className="text-5xl font-bold text-primary">#{avgRank}</span>
              <span className="text-gray-500">across all tracked keywords</span>
            </div>
          </CardContent>
        </Card>
      )}

      {allResults.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
          <p className="text-gray-500">No data yet. Complete some tracking jobs to see analytics.</p>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
