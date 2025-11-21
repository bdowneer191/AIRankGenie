import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Input, Button } from './ui/Components';
import { Search, Plus, X, Globe, Smartphone, Monitor, Sparkles } from 'lucide-react';
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
  const [searchMode, setSearchMode] = useState<SearchMode>('google');
  const [location, setLocation] = useState('United States');
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

      // Reset form
      setTargetUrl('');
      setQueries([]);
      setCurrentQuery('');
    } catch (e) {
      console.error("Error creating job:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto shadow-lg border-0 ring-1 ring-gray-200">
      <CardHeader className="border-b border-gray-100 bg-gray-50/50 pb-8">
        <CardTitle className="text-2xl text-primary">Start New Tracking Job</CardTitle>
        <p className="text-gray-500 mt-2">Monitor your search engine rankings and AI Overview presence.</p>
      </CardHeader>
      <CardContent className="space-y-8 pt-8">
        
        {/* Target URL */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Target Website URL</label>
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

        {/* Keywords Input */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Keywords to Track</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input 
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddQuery()}
                placeholder="Enter a keyword and press Enter"
                className="pl-10"
              />
            </div>
            <Button onClick={() => handleAddQuery()} variant="secondary" size="md">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Keyword Tags */}
          <div className="flex flex-wrap gap-2 min-h-[40px] p-4 bg-gray-50 rounded-lg border border-gray-100">
            {queries.length === 0 && <span className="text-sm text-gray-400 italic">No keywords added yet...</span>}
            {queries.map((q, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
                {q}
                <button onClick={() => handleRemoveQuery(i)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
             <label className="text-sm font-semibold text-gray-900">Device Type</label>
             <div className="flex p-1 bg-gray-100 rounded-lg">
               <button 
                 onClick={() => setDevice('desktop')}
                 className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${device === 'desktop' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
               >
                 <Monitor className="h-4 w-4" /> Desktop
               </button>
               <button 
                 onClick={() => setDevice('mobile')}
                 className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${device === 'mobile' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
               >
                 <Smartphone className="h-4 w-4" /> Mobile
               </button>
             </div>
          </div>
          
          <div className="space-y-3">
             <label className="text-sm font-semibold text-gray-900">Location</label>
             <Input 
               value={location}
               onChange={(e) => setLocation(e.target.value)}
             />
          </div>
        </div>

        {/* Search Mode Selection */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Search Engine Mode</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setSearchMode('google')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium rounded-lg border transition-all ${searchMode === 'google' ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-200' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Search className="h-4 w-4" /> Standard Google
            </button>
            <button
              onClick={() => setSearchMode('google_ai_mode')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium rounded-lg border transition-all ${searchMode === 'google_ai_mode' ? 'bg-purple-50 border-purple-200 text-purple-700 ring-1 ring-purple-200' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Sparkles className="h-4 w-4" /> AI Overview (SGE)
            </button>
            <button
              onClick={() => setSearchMode('google_ask_ai')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium rounded-lg border transition-all ${searchMode === 'google_ask_ai' ? 'bg-green-50 border-green-200 text-green-700 ring-1 ring-green-200' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <Monitor className="h-4 w-4" /> Ask AI
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Button 
            onClick={handleSubmit} 
            className="w-full h-12 text-base shadow-lg shadow-primary/20" 
            disabled={!targetUrl || queries.length === 0 || isLoading}
          >
            {isLoading ? "Starting..." : `Start Tracking ${queries.length > 0 ? `(${queries.length} keywords)` : ''}`}
          </Button>
        </div>

      </CardContent>
    </Card>
  );
};

export default QueryForm;