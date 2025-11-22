import type { VercelRequest, VercelResponse } from '@vercel/node';

// Timeout-safe fetch with retry
const fetchWithTimeout = async (url: string, timeout = 8000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Normalize URL
const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
};

// Estimate search volume (mock data - in production, use SEMrush/Ahrefs API)
const estimateSearchVolume = (query: string): number => {
  const wordCount = query.split(' ').length;
  const baseVolume = 1000;
  
  // Simple heuristic: shorter queries = higher volume
  if (wordCount === 1) return baseVolume * 5;
  if (wordCount === 2) return baseVolume * 3;
  if (wordCount === 3) return baseVolume * 2;
  return baseVolume;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}`;
  
  console.log(`[${requestId}] Request started`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { targetUrl, queries, location = 'United States', device = 'desktop', searchMode = 'google' } = req.body;
    
    if (!targetUrl || !queries || !Array.isArray(queries)) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    
    const serpApiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
    if (!serpApiKey) {
      return res.status(500).json({ error: 'SERP_API_KEY not configured' });
    }
    
    const normalizedTarget = normalizeUrl(targetUrl);
    
    // Process queries with timeout protection (max 2 to stay under 10s)
    const limitedQueries = queries.slice(0, 2);
    
    const results = await Promise.all(
      limitedQueries.map(async (query: string) => {
        try {
          // Check remaining time
          const elapsed = Date.now() - startTime;
          if (elapsed > 8000) {
            throw new Error('Timeout protection triggered');
          }
          
          const engine = searchMode === 'google_ai_mode' ? 'google_ai_mode' : 'google';
          const params = new URLSearchParams({
            q: query,
            api_key: serpApiKey,
            engine,
            location,
            num: '20',
            hl: 'en',
            gl: 'us',
            device
          });
          
          const serpRes = await fetchWithTimeout(`https://serpapi.com/search?${params.toString()}`, 7000);
          
          if (!serpRes.ok) {
            throw new Error(`SerpAPI error: ${serpRes.status}`);
          }
          
          const data = await serpRes.json();
          
          // Parse results
          let rank: number | null = null;
          let aiContent = "";
          let isAiPresent = false;
          const competitors: any[] = [];
          const features: string[] = [];
          
          // Feature Detection
          if (data.ai_overview) {
            features.push("AI Overview");
            isAiPresent = true;
            aiContent = data.ai_overview.snippet || "";
          }
          if (data.ask_ai_result) {
            features.push("Ask AI");
            isAiPresent = true;
            aiContent = data.ask_ai_result.snippet || "";
          }
          
          // Standard search parsing
          if (searchMode === 'google' || searchMode === 'google_ask_ai') {
            const organic = data.organic_results || [];
            for (const item of organic) {
              if (item.link && normalizeUrl(item.link).includes(normalizedTarget)) {
                rank = item.position;
                break;
              }
            }
            organic.slice(0, 5).forEach((c: any) => {
              competitors.push({
                rank: c.position,
                title: c.title,
                url: c.link,
                snippet: c.snippet || ""
              });
            });
          }
          // AI Mode parsing
          else if (searchMode === 'google_ai_mode') {
            isAiPresent = true;
            aiContent = data.text_blocks?.[0]?.snippet || data.ai_overview?.snippet || "";
            
            const sources = data.sources || data.references || [];
            sources.forEach((source: any, idx: number) => {
              competitors.push({
                rank: idx + 1,
                title: source.title || "",
                url: source.link || "",
                snippet: source.snippet || ""
              });
              if (source.link && normalizeUrl(source.link).includes(normalizedTarget)) {
                rank = idx + 1;
              }
            });
          }
          
          // Estimate search volume
          const searchVolume = estimateSearchVolume(query);
          
          return {
            query,
            rank,
            url: targetUrl,
            searchVolume,
            history: [{ date: new Date().toISOString(), rank, searchVolume }],
            aiOverview: {
              present: isAiPresent,
              content: aiContent
            },
            serpFeatures: features,
            competitors
          };
          
        } catch (error: any) {
          console.error(`[${requestId}] Query failed: ${query}`, error.message);
          return {
            query,
            rank: null,
            url: targetUrl,
            searchVolume: estimateSearchVolume(query),
            history: [],
            aiOverview: { present: false, content: `Error: ${error.message}` },
            serpFeatures: [],
            competitors: []
          };
        }
      })
    );
    
    const elapsed = Date.now() - startTime;
    console.log(`[${requestId}] Completed in ${elapsed}ms`);
    
    return res.status(200).json({
      status: 'completed',
      results,
      processingTime: elapsed
    });
    
  } catch (error: any) {
    console.error(`[${requestId}] Critical error:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
