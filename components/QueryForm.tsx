import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Input, Button } from './ui/Components';
import { Search, Plus, X, Globe, Bot, Sparkles } from 'lucide-react';
import { createJob } from '../services/simulationService';
import { TrackingJob, SearchMode } from '../types';

interface QueryFormProps {
  onJobCreated: (job: TrackingJob) => void;
}

const QueryForm: React.FC<QueryFormProps> = ({ onJobCreated }) => {
  const [targetUrl, setTargetUrl] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [location, setLocation] = useState('United States');
  const [searchMode, setSearchMode] = useState<SearchMode>('google');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddQuery = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (currentQuery.trim() && !queries.includes(currentQuery.trim())) {
      setQueries([...queries, currentQuery.trim()]);
      setCurrentQuery('');
    }
  };

  const handleRemoveQuery = (index: number) => {
    setQueries(queries.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!targetUrl || queries.length === 0) return;
    
    setIsLoading(true);
    try {
      const job = createJob(targetUrl, queries, location, device, searchMode);
      onJobCreated(job);
      setTargetUrl('');
      setQueries([]);
      setCurrentQuery('');
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto shadow-lg border-0 ring-1 ring-gray-200">
      <CardHeader className="border-b border-gray-100 bg-gray-50/50 pb-8">
        <CardTitle className="text-2xl text-primary">New Tracking Job</CardTitle>
        <p className="text-gray-500 mt-2">Track organic ranks and AI visibility.</p>
      </CardHeader>
      <CardContent className="space-y-8 pt-8">
        
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Target URL</label>
          <div className="relative">
            <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com" 
              className="pl-10 font-mono"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Search Mode</label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setSearchMode('google')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${searchMode === 'google' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
            >
              <Search className="h-4 w-4" /> Standard
            </button>
            <button
              onClick={() => setSearchMode('google_ai_mode')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${searchMode === 'google_ai_mode' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
            >
              <Sparkles className="h-4 w-4" /> AI Mode
            </button>
            <button
              onClick={() => setSearchMode('google_ask_ai')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${searchMode === 'google_ask_ai' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
            >
              <Bot className="h-4 w-4" /> Ask AI
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Keywords</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input 
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddQuery()}
                placeholder="Enter keyword..."
                className="pl-10"
              />
            </div>
            <Button onClick={() => handleAddQuery()} variant="secondary" size="md"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {queries.map((q, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700">
                {q}
                <button onClick={() => handleRemoveQuery(i)}><X className="h-3 w-3 text-gray-400 hover:text-red-500" /></button>
              </span>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Button 
            onClick={handleSubmit} 
            className="w-full h-12 text-base shadow-lg" 
            disabled={!targetUrl || queries.length === 0 || isLoading}
          >
            {isLoading ? "Starting..." : "Start Tracking"}
          </Button>
        </div>

      </CardContent>
    </Card>
  );
};

export default QueryForm;
