import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// --- Helper: Normalize URL ---
const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
};

// --- Helper: Sleep ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Helper: Fetch with Smart Retry (Fixes 503/429 Errors) ---
const fetchWithRetry = async (url: string, retries = 3): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      
      // Success or Client Error (that isn't rate limit) -> Return
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      // Server Error (5xx) or Rate Limit (429) -> Retry
      console.warn(`⚠️ SerpApi Attempt ${i + 1} failed (Status ${res.status}). Retrying...`);
      await sleep(1500 * (i + 1)); // Wait 1.5s, 3s, 4.5s...

    } catch (err) {
      console.warn(`⚠️ Network Error on attempt ${i + 1}. Retrying...`);
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`SerpApi failed after ${retries} attempts.`);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  console.log(`[${requestId}] 🚀 API Track Handler Started`);

  // 1. CORS Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 2. Input Validation
    const { targetUrl, queries, location = 'United States', device = 'desktop', searchMode = 'google' } = req.body;

    if (!targetUrl || !queries || !Array.isArray(queries)) {
      return res.status(400).json({ error: 'Invalid input: targetUrl and queries array required' });
    }

    const serpApiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!serpApiKey) {
      return res.status(500).json({ error: 'Server misconfiguration: SERP_API_KEY missing' });
    }

    const normalizedTarget = normalizeUrl(targetUrl);

    // 3. Parallel Processing
    const promises = queries.map(async (query: string, index: number) => {
      const qId = `${requestId}-q${index}`;
      try {
        // Engine Selection based on Documentation
        // 'google_ai_overview' requires a token, so we use 'google' to find embedded AI results.
        // 'google_ai_mode' is the standalone AI engine.
        let engine = 'google';
        if (searchMode === 'google_ai_mode') {
          engine = 'google_ai_mode';
        } 
        // Note: 'google_ask_ai' is treated as standard google search parsing for "Ask AI" features.

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

        // Call SerpApi
        console.log(`[${qId}] 🌐 Calling SerpApi (${engine})...`);
        const serpRes = await fetchWithRetry(`https://serpapi.com/search?${params.toString()}`);
        
        if (!serpRes.ok) {
          const errText = await serpRes.text();
          throw new Error(`SerpApi Error ${serpRes.status}: ${errText}`);
        }
        
        const data = await serpRes.json();
        console.log(`[${qId}] ✅ Data Received.`);

        // Parse Results
        let rank: number | null = null;
        let aiContent = "";
        let isAiPresent = false;
        const competitors: any[] = [];
        const features: string[] = [];

        // Feature Detection
        if (data.ai_overview) features.push("AI Overview");
        if (data.ask_ai_result) features.push("Ask AI");

        // Parsing Strategy: Standard & Ask AI
        if (searchMode === 'google' || searchMode === 'google_ask_ai') {
          if (data.ai_overview) { isAiPresent = true; aiContent = data.ai_overview.snippet; }
          if (data.ask_ai_result) { isAiPresent = true; aiContent = data.ask_ai_result.snippet; }

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
        // Parsing Strategy: AI Mode
        else if (searchMode === 'google_ai_mode') {
          isAiPresent = true;
          // AI Mode results often come in 'text_blocks' or 'ai_overview'
          aiContent = data.text_blocks?.[0]?.snippet || data.ai_overview?.snippet || "AI Mode Result";
          
          const sources = data.sources || data.references || [];
          sources.forEach((source: any, idx: number) => {
             competitors.push({ rank: idx + 1, title: source.title, url: source.link, snippet: source.snippet || "" });
             if (source.link && normalizeUrl(source.link).includes(normalizedTarget)) {
               rank = idx + 1; // Rank based on citation order
             }
          });
        }

        // Gemini Analysis (Scoped properly to prevent SyntaxError)
        let analysisText = "Analysis unavailable.";
        if (geminiApiKey) {
          try {
            const myGenAI = new GoogleGenAI({ apiKey: geminiApiKey });
            const model = myGenAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Analyze SEO ranking for "${query}" (Rank: ${rank}, AI: ${isAiPresent}). Give 1 short tip.`;
            const result = await model.generateContent(prompt);
            analysisText = result.response.text();
          } catch (err) { console.error(`[${qId}] Gemini Error:`, err); }
        }

        return {
          query,
          rank,
          url: targetUrl,
          history: [{ date: new Date().toISOString(), rank }],
          aiOverview: { present: isAiPresent, content: aiContent, analysis: analysisText, type: searchMode },
          serpFeatures: features,
          competitors
        };

      } catch (error: any) {
        console.error(`[${qId}] 💥 Processing Failed:`, error.message);
        return {
          query,
          rank: null,
          url: targetUrl,
          history: [],
          aiOverview: { present: false, content: `Error: ${error.message}` },
          serpFeatures: [],
          competitors: []
        };
      }
    });

    const results = await Promise.all(promises);
    return res.status(200).json({ status: 'completed', results });

  } catch (criticalError: any) {
    console.error(`[${requestId}] 🔥 FATAL:`, criticalError);
    return res.status(500).json({ error: "Internal Server Error", details: criticalError.message });
  }
}
