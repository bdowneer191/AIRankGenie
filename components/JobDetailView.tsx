import React from 'react';
import { TrackingJob, TrackingResult } from '../types';
import { Card, CardContent, Badge, Button } from './ui/Components';
import { 
  ArrowLeft, Sparkles, Trophy, CheckCircle2, Search, Bot,
  ExternalLink, Lightbulb, MessageSquare, Zap
} from 'lucide-react';

interface JobDetailViewProps {
  job: TrackingJob;
  onBack: () => void;
}

// --- Visual Components for Different Modes ---

const StandardResultVisual = ({ rank, url }: { rank: number | null, url: string }) => (
  <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
    <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg ${
      rank && rank <= 3 ? 'bg-emerald-100 text-emerald-700' :
      rank && rank <= 10 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
    }`}>
      <span className="text-lg font-bold">{rank || '-'}</span>
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-xs text-gray-500 uppercase font-semibold">Organic Rank</div>
      <div className="text-sm font-medium truncate text-gray-900">{url}</div>
    </div>
  </div>
);

const AiModeVisual = ({ rank, citations }: { rank: number | null, citations: number }) => (
  <div className="relative p-4 bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-lg">
    <div className="absolute top-2 right-2">
      <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
    </div>
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${rank ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
        <span className="font-bold">{rank || '?'}</span>
      </div>
      <div>
        <div className="text-xs text-purple-600 font-bold uppercase">AI Citation Rank</div>
        <div className="text-sm text-gray-600">Cited among {citations} sources</div>
      </div>
    </div>
  </div>
);

const AskAiVisual = ({ content }: { content: string }) => (
  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg relative">
    <div className="flex gap-3">
      <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-5 h-5 text-white" />
      </div>
      <div className="space-y-1">
        <div className="text-xs font-bold text-indigo-800 uppercase tracking-wide">Ask AI Answer</div>
        <p className="text-sm text-indigo-900/80 leading-relaxed line-clamp-3">
          "{content || "No direct answer generated."}"
        </p>
      </div>
    </div>
  </div>
);

// --- Main Component ---

const JobDetailView: React.FC<JobDetailViewProps> = ({ job, onBack }) => {
  // Calculate detailed stats
  const total = job.results.length;
  const ranked = job.results.filter(r => r.rank).length;
  const aiFeatured = job.results.filter(r => r.aiOverview.present).length;

  const modeLabel = {
    'google': 'Standard Google',
    'google_ai_mode': 'Google AI Mode',
    'google_ask_ai': 'Google Ask AI'
  }[job.searchMode] || 'Unknown Mode';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header Navigation */}
      <button onClick={onBack} className="flex items-center text-sm text-gray-500 hover:text-primary transition-colors group">
        <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </button>

      {/* Job Overview Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={job.status === 'completed' ? 'success' : 'default'}>
              {job.status.toUpperCase()}
            </Badge>
            <span className="text-xs text-gray-400 font-mono">ID: {job.id.slice(-6)}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            {job.targetUrl}
            <a href={job.targetUrl.startsWith('http') ? job.targetUrl : `https://${job.targetUrl}`} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-primary transition-colors">
              <ExternalLink className="w-5 h-5" />
            </a>
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Search className="w-3 h-3" /> {modeLabel}</span>
            <span>•</span>
            <span>{job.location}</span>
            <span>•</span>
            <span>{new Date(job.createdAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Mini Stats */}
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{ranked}/{total}</div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Keywords Ranked</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">{aiFeatured}</div>
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">AI Features</div>
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="grid gap-6">
        {job.results.map((result, idx) => (
          <Card key={idx} className="overflow-hidden border-l-4 border-l-transparent hover:border-l-primary transition-all duration-300 hover:shadow-md">
            <CardContent className="p-0">
              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Column 1: Keyword & Rank Visual */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      {result.query}
                      {result.rank && result.rank <= 3 && <Trophy className="w-4 h-4 text-amber-500" />}
                    </h3>
                  </div>

                  {/* Dynamic Visual based on Mode */}
                  {job.searchMode === 'google' && <StandardResultVisual rank={result.rank} url={result.url} />}
                  {job.searchMode === 'google_ai_mode' && <AiModeVisual rank={result.rank} citations={result.competitors.length} />}
                  {job.searchMode === 'google_ask_ai' && <AskAiVisual content={result.aiOverview.content || ""} />}
                </div>

                {/* Column 2: AI Overview / Features */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">SERP Features</div>

                  <div className="flex flex-wrap gap-2">
                    {result.aiOverview.present && (
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI Detected
                      </Badge>
                    )}
                    {result.serpFeatures.map((f, i) => (
                      <Badge key={i} variant="default" className="bg-gray-100 text-gray-600 border-gray-200">
                        {f}
                      </Badge>
                    ))}
                    {result.serpFeatures.length === 0 && !result.aiOverview.present && (
                      <span className="text-sm text-gray-400 italic">No special features detected</span>
                    )}
                  </div>

                  {/* Snippet Preview */}
                  {result.aiOverview.present && job.searchMode !== 'google_ask_ai' && (
                    <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-100 text-sm text-gray-600 italic">
                      <span className="font-semibold text-gray-900 not-italic block mb-1">AI Snippet:</span>
                      "{result.aiOverview.content?.slice(0, 120)}..."
                    </div>
                  )}
                </div>

                {/* Column 3: Gemini Insight (Animated) */}
                <div className="lg:col-span-1">
                  <div className="h-full bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-5 border border-indigo-100 flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Zap className="w-16 h-16 text-indigo-600" />
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold text-indigo-800 uppercase">Gemini Strategy Insight</span>
                    </div>

                    <div className="flex-1">
                      {result.aiOverview.analysis && result.aiOverview.analysis !== "Analysis unavailable." ? (
                        <p className="text-sm text-indigo-900 leading-relaxed font-medium animate-in fade-in duration-1000">
                          {result.aiOverview.analysis}
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 animate-pulse">
                          <div className="h-2 bg-indigo-200 rounded w-3/4"></div>
                          <div className="h-2 bg-indigo-200 rounded w-1/2"></div>
                          <span className="text-xs text-indigo-400 mt-2">Generating insight...</span>
                        </div>
                      )}
                    </div>
                  </div>
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
