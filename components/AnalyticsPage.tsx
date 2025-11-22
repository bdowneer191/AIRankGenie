import React, { useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Download, Calendar, Target } from 'lucide-react';
import { TrackingJob, TrackingResult } from '../types';

interface AnalyticsDashboardProps {
  job: TrackingJob;
  onBack: () => void;
}

// Calculate Share of Voice
const calculateSoV = (rank: number | null, searchVolume: number = 1000): number => {
  if (!rank || rank > 100) return 0;
  
  const ctrCurve: { [key: number]: number } = {
    1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.07,
    6: 0.05, 7: 0.04, 8: 0.03, 9: 0.03, 10: 0.02
  };
  
  const ctr = ctrCurve[rank] || (rank <= 20 ? 0.01 : 0.005);
  return Math.round(searchVolume * ctr);
};

// Sentiment analysis
const analyzeSentiment = (text: string, brandName: string) => {
  const positiveWords = ['best', 'top', 'excellent', 'great', 'leading', 'trusted', 'recommended'];
  const negativeWords = ['worst', 'poor', 'bad', 'unreliable', 'problem', 'avoid'];
  
  const lowerText = text.toLowerCase();
  const hasBrand = lowerText.includes(brandName.toLowerCase());
  
  if (!hasBrand) return 'neutral';
  
  let score = 0;
  positiveWords.forEach(word => { if (lowerText.includes(word)) score++; });
  negativeWords.forEach(word => { if (lowerText.includes(word)) score--; });
  
  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
};

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ job, onBack }) => {
  // Enhanced results with calculations
  const enhancedResults = useMemo(() => {
    return job.results.map(result => {
      const sov = calculateSoV(result.rank, result.searchVolume || 1000);
      const sentiment = result.aiOverview.content 
        ? analyzeSentiment(result.aiOverview.content, job.targetUrl)
        : 'neutral';
      
      return {
        ...result,
        sov,
        sentiment
      };
    });
  }, [job.results, job.targetUrl]);
  
  // Aggregate metrics
  const metrics = useMemo(() => {
    const rankedResults = enhancedResults.filter(r => r.rank);
    const totalSoV = enhancedResults.reduce((sum, r) => sum + r.sov, 0);
    const avgRank = rankedResults.length > 0
      ? rankedResults.reduce((sum, r) => sum + (r.rank || 0), 0) / rankedResults.length
      : 0;
    const aiVisibility = enhancedResults.filter(r => r.aiOverview.present).length / enhancedResults.length * 100;
    const top10 = enhancedResults.filter(r => r.rank && r.rank <= 10).length;
    const top3 = enhancedResults.filter(r => r.rank && r.rank <= 3).length;
    
    const sentimentCounts = {
      positive: enhancedResults.filter(r => r.sentiment === 'positive').length,
      neutral: enhancedResults.filter(r => r.sentiment === 'neutral').length,
      negative: enhancedResults.filter(r => r.sentiment === 'negative').length
    };
    
    // Volatility calculation
    const volatility = job.volatilityIndex || 0;
    
    return { totalSoV, avgRank, aiVisibility, top10, top3, sentimentCounts, volatility };
  }, [enhancedResults, job.volatilityIndex]);
  
  // Chart data
  const rankDistributionData = useMemo(() => {
    const ranges = [
      { range: '1-3', count: 0 },
      { range: '4-10', count: 0 },
      { range: '11-20', count: 0 },
      { range: '21-50', count: 0 },
      { range: '51+', count: 0 }
    ];
    
    enhancedResults.forEach(r => {
      if (!r.rank) return;
      if (r.rank <= 3) ranges[0].count++;
      else if (r.rank <= 10) ranges[1].count++;
      else if (r.rank <= 20) ranges[2].count++;
      else if (r.rank <= 50) ranges[3].count++;
      else ranges[4].count++;
    });
    
    return ranges;
  }, [enhancedResults]);
  
  const sovData = useMemo(() => {
    return enhancedResults
      .filter(r => r.sov > 0)
      .sort((a, b) => b.sov - a.sov)
      .slice(0, 10)
      .map(r => ({
        keyword: r.query.substring(0, 30),
        sov: r.sov,
        rank: r.rank || 0
      }));
  }, [enhancedResults]);
  
  const sentimentData = [
    { name: 'Positive', value: metrics.sentimentCounts.positive, color: '#10b981' },
    { name: 'Neutral', value: metrics.sentimentCounts.neutral, color: '#6b7280' },
    { name: 'Negative', value: metrics.sentimentCounts.negative, color: '#ef4444' }
  ];
  
  // Export functionality
  const exportData = () => {
    const csv = [
      ['Keyword', 'Rank', 'SoV', 'AI Overview', 'Sentiment'],
      ...enhancedResults.map(r => [
        r.query,
        r.rank || 'Not ranked',
        r.sov,
        r.aiOverview.present ? 'Yes' : 'No',
        r.sentiment
      ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rank-tracker-${job.id}.csv`;
    a.click();
  };
  
  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back
        </button>
        <button
          onClick={exportData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>
      
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Total SoV" value={metrics.totalSoV.toLocaleString()} color="blue" />
        <MetricCard label="Avg Position" value={metrics.avgRank.toFixed(1)} color="purple" />
        <MetricCard label="AI Visibility" value={`${metrics.aiVisibility.toFixed(0)}%`} color="indigo" />
        <MetricCard label="Top 10" value={metrics.top10} color="green" />
        <MetricCard label="Top 3" value={metrics.top3} color="emerald" />
        <MetricCard label="Volatility" value={metrics.volatility.toFixed(1)} color="amber" trend />
      </div>
      
      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking Distribution */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Ranking Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rankDistributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Sentiment Analysis */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">AI Overview Sentiment</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sentimentData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {sentimentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 gap-6">
        {/* Share of Voice */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Top Keywords by Share of Voice</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={sovData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" />
              <YAxis dataKey="keyword" type="category" width={150} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Bar dataKey="sov" fill="#8b5cf6" radius={[0, 8, 8, 0]}>
                {sovData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.rank <= 3 ? '#10b981' : entry.rank <= 10 ? '#3b82f6' : '#8b5cf6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Detailed Results Table */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Keyword Performance Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Keyword</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Rank</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">SoV</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">AI Overview</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Sentiment</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Trend</th>
              </tr>
            </thead>
            <tbody>
              {enhancedResults.map((result, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{result.query}</td>
                  <td className="text-center py-3 px-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      result.rank && result.rank <= 3 ? 'bg-green-100 text-green-800' :
                      result.rank && result.rank <= 10 ? 'bg-blue-100 text-blue-800' :
                      result.rank ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {result.rank || 'NR'}
                    </span>
                  </td>
                  <td className="text-center py-3 px-4 text-gray-600">{result.sov.toLocaleString()}</td>
                  <td className="text-center py-3 px-4">
                    {result.aiOverview.present ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="text-center py-3 px-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      result.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                      result.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {result.sentiment}
                    </span>
                  </td>
                  <td className="text-center py-3 px-4">
                    {result.history.length >= 2 ? (
                      <TrendIndicator history={result.history} />
                    ) : (
                      <Minus className="w-4 h-4 text-gray-400 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Helper Components
const MetricCard = ({ label, value, color, trend }: any) => (
  <div className="bg-white rounded-xl shadow-lg p-4">
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    <div className="text-sm text-gray-500 mt-1">{label}</div>
    {trend && (
      <div className="mt-2">
        {value > 5 ? (
          <span className="text-xs text-red-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> High
          </span>
        ) : (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> Low
          </span>
        )}
      </div>
    )}
  </div>
);

const TrendIndicator = ({ history }: any) => {
  if (history.length < 2) return <Minus className="w-4 h-4 text-gray-400 mx-auto" />;
  
  const recent = history.slice(-2);
  const oldRank = recent[0].rank || 100;
  const newRank = recent[1].rank || 100;
  
  if (newRank < oldRank - 2) {
    return <TrendingUp className="w-4 h-4 text-green-600 mx-auto" />;
  } else if (newRank > oldRank + 2) {
    return <TrendingDown className="w-4 h-4 text-red-600 mx-auto" />;
  }
  return <Minus className="w-4 h-4 text-gray-400 mx-auto" />;
};

export default AnalyticsDashboard;
