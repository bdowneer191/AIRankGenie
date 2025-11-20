import React, { useState } from 'react';
import { TrackingJob, TrackingResult } from '../types';
import { Card, CardContent } from './ui/Components';
import { 
  ArrowLeft, 
  Sparkles, 
  Trophy, 
  CheckCircle2, 
  MapPin, 
  HelpCircle, 
  Layout, 
  Video, 
  Image as ImageIcon, 
  ShoppingBag, 
  Newspaper, 
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  List,
  Globe
} from 'lucide-react';
import { analyzeResultWithGemini } from '../services/geminiService';
import { Button } from './ui/Components';

interface JobDetailViewProps {
  job: TrackingJob;
  onBack: () => void;
}

const getFeatureConfig = (feature: string) => {
  const normalized = feature.toLowerCase();
  if (normalized.includes('ai overview')) return { icon: Sparkles, className: 'bg-purple-50 text-purple-700 border-purple-200' };
  if (normalized.includes('people also ask')) return { icon: HelpCircle, className: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (normalized.includes('local')) return { icon: MapPin, className: 'bg-red-50 text-red-700 border-red-200' };
  if (normalized.includes('featured snippet')) return { icon: Layout, className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  if (normalized.includes('video')) return { icon: Video, className: 'bg-pink-50 text-pink-700 border-pink-200' };
  if (normalized.includes('image')) return { icon: ImageIcon, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (normalized.includes('shopping') || normalized.includes('product')) return { icon: ShoppingBag, className: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
  if (normalized.includes('news') || normalized.includes('top stories')) return { icon: Newspaper, className: 'bg-orange-50 text-orange-700 border-orange-200' };
  if (normalized.includes('knowledge')) return { icon: BookOpen, className: 'bg-violet-50 text-violet-700 border-violet-200' };
  if (normalized.includes('sitelinks')) return { icon: List, className: 'bg-slate-100 text-slate-700 border-slate-300' };
  if (normalized.includes('organic')) return { icon: Search, className: 'bg-white text-gray-600 border-gray-200' };
  return { icon: Globe, className: 'bg-gray-50 text-gray-600 border-gray-200' };
};

const RankHistoryChart: React.FC<{ history: { date: string; rank: number | null }[] }> = ({ history }) => {
  const [hoverInfo, setHoverInfo] = useState<{x: number, y: number, rank: number, date: string} | null>(null);

  const width = 160;
  const height = 40;
  const padding = 6;
  
  // Filter out nulls for range calculation
  const validRanks = history.map(h => h.rank).filter((r): r is number => r !== null);
  
  if (validRanks.length === 0) {
    return <div className="h-[50px] w-[160px] flex items-center justify-center text-[10px] text-gray-300 border border-gray-100 rounded bg-gray-50/50">No history data</div>;
  }

  const minRank = Math.min(...validRanks);
  const maxRank = Math.max(...validRanks);
  
  // Dynamic range with buffer
  const rangeMin = Math.max(1, minRank - 2);
  const rangeMax = maxRank + 2;
  const range = rangeMax - rangeMin;

  const getX = (index: number) => (index / (history.length - 1)) * width;
  const getY = (rank: number) => {
    // Invert Y because rank 1 is top (y=padding)
    return ((rank - rangeMin) / range) * (height - 2 * padding) + padding;
  };

  // Build path
  let pathD = '';
  history.forEach((point, i) => {
    if (point.rank === null) return;
    const x = getX(i);
    const y = getY(point.rank);
    if (i === 0 || history[i - 1].rank === null) {
      pathD += `M ${x} ${y} `;
    } else {
      pathD += `L ${x} ${y} `;
    }
  });
  
  // Trend calculation
  const first = history.find(h => h.rank !== null)?.rank;
  const last = history[history.length - 1].rank;
  const isImproved = first && last && last < first;
  const isDeclined = first && last && last > first;
  const strokeColor = isImproved ? '#10b981' : isDeclined ? '#ef4444' : '#64748b'; // emerald, red, or slate

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1 text-[10px] font-medium text-gray-400 mb-1">
         {isImproved ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : 
          isDeclined ? <TrendingDown className="w-3 h-3 text-red-500" /> : 
          <Minus className="w-3 h-3" />}
         <span>14d Trend</span>
      </div>
      
      <div className="relative" onMouseLeave={() => setHoverInfo(null)}>
        <svg width={width} height={height} className="overflow-visible">
          {/* Guide lines */}
          <line x1="0" y1="0" x2={width} y2="0" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="0" y1={height} x2={width} y2={height} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
          
          {/* Chart Line */}
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          
          {/* Data Points */}
          {history.map((point, i) => {
             if (point.rank === null) return null;
             const x = getX(i);
             const y = getY(point.rank);
             
             const isStartOrEnd = i === 0 || i === history.length - 1;
             
             return (
               <g key={i}>
                 {isStartOrEnd && (
                    <circle cx={x} cy={y} r="2.5" fill={strokeColor} />
                 )}
                 {/* Invisible hover target */}
                 <circle 
                   cx={x} cy={y} r="6" 
                   fill="transparent" 
                   className="cursor-pointer"
                   onMouseEnter={() => setHoverInfo({x, y, rank: point.rank!, date: point.date})}
                 />
               </g>
             );
          })}
        </svg>

        {/* Tooltip */}
        {hoverInfo && (
          <div 
            className="absolute z-20 px-2 py-1 bg-slate-800 text-white text-[10px] rounded shadow-xl pointer-events-none whitespace-nowrap transform -translate-x-1/2 -translate-y-full transition-opacity duration-200"
            style={{ left: hoverInfo.x, top: hoverInfo.y - 8 }}
          >
            <div className="font-semibold">Rank #{hoverInfo.rank}</div>
            <div className="text-slate-300 text-[9px]">{new Date(hoverInfo.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</div>
            
            {/* Tooltip arrow */}
            <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 border-4 border-transparent border-t-slate-800"></div>
          </div>
        )}
      </div>
    </div>
  );
};

const JobDetailView: React.FC<JobDetailViewProps> = ({ job, onBack }) => {
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, string>>({});

  const handleAnalyze = async (result: TrackingResult) => {
    setAnalyzingId(result.query);
    const analysis = await analyzeResultWithGemini(result);
    setAnalyses(prev => ({ ...prev, [result.query]: analysis }));
    setAnalyzingId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <button onClick={onBack} className="flex items-center text-sm text-gray-500 hover:text-primary transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {job.targetUrl}
            {job.status === 'completed' && <CheckCircle2 className="text-emerald-500 w-6 h-6" />}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Started {new Date(job.createdAt).toLocaleString()} • {job.queries.length} Keywords • {job.location}
          </p>
        </div>
        <div className="flex gap-3">
           <div className="text-right">
              <div className="text-sm font-medium text-gray-900">Visibility Score</div>
              <div className="text-2xl font-bold text-primary">
                {job.results.length > 0 
                  ? Math.round((job.results.filter(r => r.rank && r.rank <= 10).length / job.results.length) * 100) 
                  : 0}%
              </div>
           </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid gap-4">
        {job.results.map((result, idx) => (
          <Card key={idx} className="overflow-hidden border-l-4 border-l-transparent hover:border-l-primary transition-all">
            <CardContent className="p-0">
              <div className="p-6 flex flex-col md:flex-row gap-6">
                
                {/* Rank Indicator */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px]">
                   {result.rank ? (
                     <>
                       <div className={`text-3xl font-bold ${result.rank <= 3 ? 'text-emerald-600' : result.rank <= 10 ? 'text-primary' : 'text-amber-600'}`}>
                         #{result.rank}
                       </div>
                       <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Rank</div>
                     </>
                   ) : (
                     <>
                       <div className="text-3xl font-bold text-gray-300">-</div>
                       <div className="text-xs text-gray-400 font-medium">Not Ranked</div>
                     </>
                   )}
                </div>

                {/* Main Content */}
                <div className="flex-1 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-gray-900">{result.query}</h3>
                      {/* SERP Features Badges */}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {result.serpFeatures.map((feature, i) => {
                          const config = getFeatureConfig(feature);
                          const Icon = config.icon;
                          return (
                            <div key={i} className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors shadow-sm ${config.className}`} title={feature}>
                              <Icon className="w-3 h-3 mr-1.5" />
                              {feature}
                            </div>
                          );
                        })}
                        
                        {result.rank && result.rank <= 3 && (
                          <div className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm">
                            <Trophy className="w-3 h-3 mr-1.5" /> Top 3
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Historical Chart - Hidden on mobile, visible on desktop */}
                    <div className="hidden sm:block">
                      <RankHistoryChart history={result.history} />
                    </div>
                  </div>

                  {/* AI Overview Content (Simulated) */}
                  {result.aiOverview.present && (
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                      <p className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Google AI Overview detected
                      </p>
                      <p className="text-sm text-amber-900/80 italic">"{result.aiOverview.content}"</p>
                    </div>
                  )}
                  
                  {/* Gemini Analysis Section */}
                  {analyses[result.query] ? (
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 animate-in zoom-in-95">
                       <div className="flex items-center gap-2 mb-2">
                         <Sparkles className="w-4 h-4 text-indigo-600" />
                         <span className="text-sm font-bold text-indigo-900">Gemini Strategy Insight</span>
                       </div>
                       <p className="text-sm text-indigo-800 leading-relaxed">
                         {analyses[result.query]}
                       </p>
                    </div>
                  ) : (
                    <div className="pt-2">
                       <Button 
                         size="sm" 
                         variant="outline" 
                         onClick={() => handleAnalyze(result)}
                         disabled={analyzingId === result.query}
                         className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                       >
                         {analyzingId === result.query ? 'Analyzing...' : 'Generate AI Strategy Insight'}
                       </Button>
                    </div>
                  )}
                </div>

                {/* Competitors Mini Table */}
                <div className="w-full md:w-64 bg-gray-50 rounded-lg p-3 text-sm border border-gray-100 hidden lg:block">
                  <h4 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Top Competitors</h4>
                  <ul className="space-y-2">
                    {result.competitors.slice(0, 3).map((comp, i) => (
                      <li key={i} className="flex items-center gap-2 truncate">
                        <span className="text-xs font-bold text-gray-400 w-4">#{comp.rank}</span>
                        <a href={comp.url} target="_blank" rel="noreferrer" className="truncate text-gray-600 hover:text-primary hover:underline flex-1 block">
                          {comp.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default JobDetailView;