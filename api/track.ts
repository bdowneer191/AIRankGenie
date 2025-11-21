import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Helper to normalize URLs for comparison
const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = Date.now().toString().slice(-6); // ID for tracing logs
  console.log(`[API-${requestId}] Track Handler Started`);

  // 1. CORS Configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    console.warn(`[API-${requestId}] Method ${req.method} not allowed`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Input Validation
    const { targetUrl, queries, location = 'United States', device = 'desktop', searchMode = 'google' } = req.body;
    
    console.log(`[API-${requestId}] Inputs:`, { 
      targetUrl, 
      queryCount: queries?.length, 
      mode: searchMode 
    });

    if (!targetUrl || !queries || !Array.isArray(queries)) {
      console.error(`[API-${requestId}] Validation Failed: Missing url or queries`);
      return res.status(400).json({ error: 'Invalid input: targetUrl and queries array required' });
    }

    // 3. API Key Check
    const serpApiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    console.log(`[API-${requestId}] Keys Check: SERP=${!!serpApiKey}, Gemini=${!!geminiApiKey}`);

    if (!serpApiKey) {
      console.error(`[API-${requestId}] Critical: SERP_API_KEY missing`);
      return res.status(500).json({ error: 'Server misconfiguration: SERP_API_KEY missing' });
    }

    const normalizedTarget = normalizeUrl(targetUrl);

    // 4. Parallel Processing
    // Mapping all queries to promises to run them simultaneously
    const promises = queries.map(async (query, index) => {
      const qId = `${requestId}-${index}`;
      try {
        console.log(`[${qId}] Processing "${query}" via ${searchMode}...`);

        // Select Engine
        const engineMap: Record<string, string> = {
          'google': 'google',
          'google_ai_mode': 'google_ai_mode',
          'google_ask_ai': 'google_ask_ai'
        };
        const engine = engineMap[searchMode as string] || 'google';

        const params = new URLSearchParams({
          q: query,
          api_key: serpApiKey,
          engine: engine,
          location: location,
          num: '20',
          hl: 'en',
          gl: 'us',
          device: device
        });

        // Call SerpAPI
        console.log(`[${qId}] Fetching SerpAPI...`);
        const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);
        
        if (!serpRes.ok) {
          const errText = await serpRes.text();
          console.error(`[${qId}] SerpAPI Failed: ${serpRes.status} - ${errText}`);
          throw new Error(`SerpAPI Error: ${serpRes.status}`);
        }
        
        const data = await serpRes.json();
        console.log(`[${qId}] SerpAPI Data received. Results: ${data.organic_results?.length || 0}`);

        // Parse Results
        let rank: number | null = null;
        let aiContent = "";
        let isAiPresent = false;
        const competitors: any[] = [];
        const features: string[] = [];

        if (data.ai_overview) features.push("AI Overview");
        if (data.ask_ai_result) features.push("Ask AI");

        // Strategy: Standard Google
        if (searchMode === 'google') {
          if (data.ai_overview) {
            isAiPresent = true;
            aiContent = data.ai_overview.snippet || "AI Overview detected";
          }
          const organic = data.organic_results || [];
          for (const item of organic) {
            if (item.link && normalizeUrl(item.link).includes(normalizedTarget)) {
              rank = item.position;
              break;
            }
          }
          organic.slice(0, 5).forEach((c: any) => competitors.push({
            rank: c.position, title: c.title, url: c.link, snippet: c.snippet
          }));
        }
        
        // Strategy: AI Mode
        else if (searchMode === 'google_ai_mode') {
          isAiPresent = true;
          aiContent = data.text_blocks?.[0]?.snippet || data.ai_overview?.snippet || "Generative AI Result";
          const sources = data.sources || data.references || [];
          sources.forEach((source: any, idx: number) => {
             competitors.push({ rank: idx + 1, title: source.title, url: source.link, snippet: source.snippet || "" });
             if (source.link && normalizeUrl(source.link).includes(normalizedTarget)) {
               rank = idx + 1;
             }
          });
        }

        // Strategy: Ask AI
        else if (searchMode === 'google_ask_ai') {
          isAiPresent = true;
          aiContent = data.answer || data.ask_ai_result?.snippet || "Ask AI Response";
          const organic = data.organic_results || [];
          for (const item of organic) {
            if (item.link && normalizeUrl(item.link).includes(normalizedTarget)) {
              rank = item.position;
              break;
            }
          }
        }

        // Gemini Analysis
        let analysisText = "Analysis pending...";
        if (geminiApiKey) {
          try {
            console.log(`[${qId}] Calling Gemini...`);
            const myGenAIClient = new GoogleGenAI({ apiKey: geminiApiKey }); // Renamed variable
            const model = myGenAIClient.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `
              Role: SEO Expert.
              Task: Analyze result for "${query}" in mode "${searchMode}".
              Data: Rank: ${rank || 'Not ranked'}. AI Present: ${isAiPresent}.
              Competitors: ${competitors.slice(0,3).map(c => c.title).join(', ')}.
              Output: One specific actionable tip (max 20 words) to improve visibility.
            `;
            
            const result = await model.generateContent(prompt);
            analysisText = result.response.text();
            console.log(`[${qId}] Gemini Success.`);
          } catch (err: any) {
            console.error(`[${qId}] Gemini Error:`, err.message);
            analysisText = "AI Analysis unavailable.";
          }
        }

        return {
          query,
          rank,
          url: targetUrl,
          history: [{ date: new Date().toISOString(), rank }],
          aiOverview: {
            present: isAiPresent,
            content: aiContent,
            analysis: analysisText,
            type: searchMode
          },
          serpFeatures: features,
          competitors
        };

      } catch (error: any) {
        console.error(`[${qId}] Query Processing Error:`, error.message);
        // Return safe fallback
        return {
          query,
          rank: null,
          url: targetUrl,
          history: [],
          aiOverview: { present: false, content: "Error processing data" },
          serpFeatures: [],
          competitors: []
        };
      }
    });

    const results = await Promise.all(promises);
    console.log(`[API-${requestId}] All queries finished. Sending response.`);
    
    return res.status(200).json({ status: 'completed', results });

  } catch (criticalError: any) {
    console.error(`[API-${requestId}] CRITICAL SERVER ERROR:`, criticalError);
    return res.status(500).json({ 
      error: "Internal Server Error", 
      details: criticalError.message 
    });
  }
}
