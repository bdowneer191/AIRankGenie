import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Input, Button } from './ui/Components';
import { Search, Plus, X, Globe, Bot, Sparkles, AlertCircle } from 'lucide-react';
import { createJob } from '../services/trackingService';
import { TrackingJob, SearchMode } from '../types';

interface QueryFormProps {
  onJobCreated: (job: TrackingJob) => void;
}

const MAX_KEYWORDS = 5; // Hard limit for Vercel Hobby

const QueryForm: React.FC<QueryFormProps> = ({ onJobCreated }) => {
  const [targetUrl, setTargetUrl] = useState('');
  const [currentQuery, setCurrentQuery] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [location, setLocation] = useState('United States');
  const [searchMode, setSearchMode] = useState<SearchMode>('google');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleAddQuery = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    if (!currentQuery.trim()) {
      setError('Please enter a keyword');
      return;
    }

    if (queries.includes(currentQuery.trim())) {
      setError('This keyword is already added');
      return;
    }

    if (queries.length >= MAX_KEYWORDS) {
      setError(`Maximum ${MAX_KEYWORDS} keywords allowed (Vercel Hobby limit)`);
      return;
    }

    setQueries([...queries, currentQuery.trim()]);
    setCurrentQuery('');
  };

  const handleRemoveQuery = (index: number) => {
    setQueries(queries.filter((_, i) => i !== index));
    setError('');
  };

  const validateUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return !!urlObj.hostname;
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    setError('');

    // Validation
    if (!targetUrl.trim()) {
      setError('Please enter a target URL');
      return;
    }

    if (!validateUrl(targetUrl)) {
      setError('Please enter a valid URL (e.g., example.com)');
      return;
    }

    if (queries.length === 0) {
      setError('Please add at least one keyword');
      return;
    }

    if (queries.length > MAX_KEYWORDS) {
      setError(`Maximum ${MAX_KEYWORDS} keywords allowed`);
      return;
    }
    
    setIsLoading(true);
    
    try {
      const job = await createJob(targetUrl.trim(), queries, location, device, searchMode);
      
      if (job) {
        onJobCreated(job);
        // Reset form
        setTargetUrl('');
        setQueries([]);
        setCurrentQuery('');
      } else {
        setError('Failed to create tracking job. Please try again.');
      }
    } catch (error: any) {
      console.error('Job creation error:', error);
      setError(error.message || 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const remainingKeywords = MAX_KEYWORDS - queries.length;

  return (
    <Card className="max-w-2xl mx-auto shadow-lg border-0 ring-1 ring-gray-200">
      <CardHeader className="border-b border-gray-100 bg-gray-50/50 pb-8">
        <CardTitle className="text-2xl text-primary">Start Tracking Job</CardTitle>
        <p className="text-gray-500 mt-2">
          Monitor your search rankings. <strong>Limit: {MAX_KEYWORDS} keywords</strong> (Vercel Hobby tier)
        </p>
      </CardHeader>
      
      <CardContent className="space-y-8 pt-8">
        
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        {/* Target URL */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Target Website URL</label>
          <div className="relative">
            <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="example.com or https://example.com" 
              className="pl-10 font-mono"
            />
          </div>
          <p className="text-xs text-gray-500">The domain you want to track</p>
        </div>

        {/* Tracking Mode Selection */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-900">Tracking Mode</label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setSearchMode('google')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${
                searchMode === 'google' 
                  ? 'bg-white text-primary shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Search className="h-4 w-4" /> Standard
            </button>
            <button
              onClick={() => setSearchMode('google_ai_mode')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${
                searchMode === 'google_ai_mode' 
                  ? 'bg-white text-purple-600 shadow-sm' 
                  : 'text-gray-500 hover:text-purple-600'
              }`}
            >
              <Sparkles className="h-4 w-4" /> AI Mode
            </button>
            <button
              onClick={() => setSearchMode('google_ask_ai')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${
                searchMode === 'google_ask_ai' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-500 hover:text-indigo-600'
              }`}
            >
              <Bot className="h-4 w-4" /> Ask AI
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {searchMode === 'google' && "Tracks standard organic rankings & detects AI Overviews."}
            {searchMode === 'google_ai_mode' && "Tracks citations inside Google's dedicated AI Mode results."}
            {searchMode === 'google_ask_ai' && "Monitors responses from the 'Ask AI' feature."}
          </p>
        </div>

        {/* Keywords Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-900">Keywords to Track</label>
            <span className={`text-xs font-medium ${
              remainingKeywords === 0 ? 'text-red-600' : 'text-gray-500'
            }`}>
              {remainingKeywords} remaining
            </span>
          </div>
          
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input 
                value={currentQuery}
                onChange={(e) => setCurrentQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddQuery()}
                placeholder="Enter a keyword and press Enter"
                className="pl-10"
                disabled={queries.length >= MAX_KEYWORDS}
              />
            </div>
            <Button 
              onClick={() => handleAddQuery()} 
              variant="secondary" 
              size="md"
              disabled={queries.length >= MAX_KEYWORDS || !currentQuery.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2 min-h-[40px] p-4 bg-gray-50 rounded-lg border border-gray-100">
            {queries.length === 0 && (
              <span className="text-sm text-gray-400 italic">No keywords added yet...</span>
            )}
            {queries.map((q, i) => (
              <span 
                key={i} 
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm"
              >
                {q}
                <button 
                  onClick={() => handleRemoveQuery(i)} 
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4 border-t border-gray-100">
          <Button 
            onClick={handleSubmit} 
            className="w-full h-12 text-base shadow-lg shadow-primary/20" 
            disabled={!targetUrl || queries.length === 0 || isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Starting Tracking...
              </>
            ) : (
              `Start Tracking ${queries.length > 0 ? `(${queries.length} keyword${queries.length > 1 ? 's' : ''})` : ''}`
            )}
          </Button>
          
          {queries.length > 0 && (
            <p className="text-xs text-center text-gray-500 mt-3">
              Processing time: ~{queries.length * 10}s per keyword
            </p>
          )}
        </div>

      </CardContent>
    </Card>
  );
};

export default QueryForm;
