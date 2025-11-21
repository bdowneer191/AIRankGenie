import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Normalize URL for accurate rank checking
const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
};

const mapSerpFeatures = (data: any): string[] => {
  const featureMap: Record<string, string> = {
    'ai_overview': 'AI Overview',
    'featured_snippet': 'Featured Snippet',
    'people_also_ask': 'People Also Ask',
    'knowledge_panel': 'Knowledge Panel',
    'local_results': 'Local Pack',
    'video_results': 'Videos',
    'shopping_results': 'Shopping',
  };
  const features: string[] = [];
  for (const key of Object.keys(featureMap)) {
    if (data[key]) features.push(featureMap[key]);
  }
  return features;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  console.log('API Track Handler Initialized');

  const { targetUrl, queries, location = 'United States', device = 'desktop', searchMode = 'google' } = req.body;

  if (!targetUrl || !queries || !Array.isArray(queries)) {
    return res.status(400).json({ error: 'Invalid input: targetUrl and queries array required' });
  }

  // API Keys
  const serpApiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!serpApiKey) {
    return res.status(500).json({ error: 'SERP API Key missing' });
  }

  const normalizedTarget = normalizeUrl(targetUrl);

  // 2. Parallel Processing (Industry Standard)
  // We map queries to promises to execute them simultaneously
  const promises = queries.map(async (query) => {
    try {
      console.log(`Processing "${query}" via ${searchMode}...`);

      // Determine Engine based on user selection
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
        num: '20', // Top 20 is sufficient for rank tracking & faster
        hl: 'en',
        gl: 'us',
        device: device
      });

      // 3. Fetch SERP Data
      const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);
      if (!serpRes.ok) {
        throw new Error(`SerpAPI Error: ${serpRes.statusText}`);
      }
      const data = await serpRes.json();

      // 4. Parse Results
      let rank: number | null = null;
      let aiContent = "";
      let isAiPresent = false;
      const competitors: any[] = [];
      const features = mapSerpFeatures(data);

      // Parsing Strategy: Standard Google
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
      
      // Parsing Strategy: AI Mode
      else if (searchMode === 'google_ai_mode') {
        isAiPresent = true;
        aiContent = data.text_blocks?.[0]?.snippet || data.ai_overview?.snippet || "AI Mode Result";
        
        const sources = data.sources || data.references || [];
        sources.forEach((source: any, idx: number) => {
           competitors.push({ rank: idx + 1, title: source.title, url: source.link, snippet: source.snippet || "" });
           if (source.link && normalizeUrl(source.link).includes(normalizedTarget)) {
             rank = idx + 1;
           }
        });
      }

      // Parsing Strategy: Ask AI
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

      // 5. AI Analysis (Gemini)
      let analysisText = "Analysis pending...";
      if (geminiApiKey) {
        try {
          const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          
          const prompt = `
            Role: SEO Specialist.
            Task: Analyze search result for "${query}" in mode "${searchMode}".
            Stats: Rank: ${rank || 'Not ranked'}. AI Overview: ${isAiPresent}.
            Competitors: ${competitors.slice(0,3).map(c => c.title).join(', ')}.
            Output: Provide 1 short, actionable tip (max 20 words) to improve visibility.
          `;
          
          const result = await model.generateContent(prompt);
          analysisText = result.response.text();
        } catch (err) {
          console.error("Gemini Error:", err);
          analysisText = "AI Analysis temporarily unavailable.";
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

    } catch (error) {
      console.error(`Error processing query "${query}":`, error);
      // Return fallback object to prevent crash
      return {
        query,
        rank: null,
        url: targetUrl,
        history: [],
        aiOverview: { present: false, content: "Error fetching data" },
        serpFeatures: [],
        competitors: []
      };
    }
  });

  // Await all parallel requests
  const results = await Promise.all(promises);

  console.log(`Batch complete. Processed ${results.length} queries.`);
  return res.status(200).json({ status: 'completed', results });
}
