import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Helper to normalize URLs for comparison
const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  console.log('API Track Handler Started');

  const { targetUrl, queries, location = 'United States', device = 'desktop', searchMode = 'google' } = req.body;

  if (!targetUrl || !queries || !Array.isArray(queries)) {
    return res.status(400).json({ error: 'Invalid input parameters' });
  }

  const apiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'SERP API Key missing' });
  }

  const normalizedTarget = normalizeUrl(targetUrl);

  // 2. Parallel Processing
  // We map all queries to promises and run them AT THE SAME TIME.
  // This avoids the 10-second Vercel timeout.
  const promises = queries.map(async (query) => {
    try {
      console.log(`Processing "${query}" in mode: ${searchMode}`);

      // Select Engine based on Mode
      let engine = 'google';
      if (searchMode === 'google_ai_mode') engine = 'google_ai_mode';
      // 'google_ask_ai' often uses the standard engine but looks for specific blocks,
      // or can be mapped if SerpAPI adds a specific engine. defaulting to google for safety.
      
      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
        engine: engine,
        location: location,
        num: '20', // Fetch fewer results for speed
        hl: 'en',
        gl: 'us',
        device: device
      });

      const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);
      
      if (!serpRes.ok) {
        throw new Error(`SerpAPI Error: ${serpRes.statusText}`);
      }
      
      const data = await serpRes.json();

      // 3. Parse Results based on Mode
      let rank: number | null = null;
      let aiContent = "";
      let isAiPresent = false;
      const competitors: any[] = [];
      const serpFeatures: string[] = [];

      // --- STANDARD GOOGLE ---
      if (searchMode === 'google' || searchMode === 'google_ask_ai') {
        // Check for AI Overview
        if (data.ai_overview) {
          isAiPresent = true;
          aiContent = data.ai_overview.snippet || "AI Overview detected";
          serpFeatures.push("AI Overview");
        }
        // Check for Ask AI Result
        if (data.ask_ai_result) {
           isAiPresent = true;
           aiContent = data.ask_ai_result.snippet || "Ask AI Result detected";
           serpFeatures.push("Ask AI");
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
      
      // --- AI MODE (Generative) ---
      else if (searchMode === 'google_ai_mode') {
        isAiPresent = true;
        aiContent = data.text_blocks?.[0]?.snippet || data.ai_overview?.snippet || "Generative AI Result";
        
        // In AI mode, rankings are often citations
        const sources = data.sources || data.references || [];
        sources.forEach((source: any, i: number) => {
           competitors.push({ rank: i + 1, title: source.title, url: source.link, snippet: source.snippet || "" });
           if (source.link && normalizeUrl(source.link).includes(normalizedTarget)) {
             rank = i + 1;
           }
        });
      }

      // 4. Gemini Analysis
      // We declare the client here, strictly inside this block to avoid "already declared" errors
      let analysisText = "Analysis unavailable.";
      
      if (geminiApiKey) {
        try {
          const googleAI = new GoogleGenAI({ apiKey: geminiApiKey });
          const model = googleAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          
          const prompt = `
            As an SEO expert, analyze this result for "${query}" (${searchMode}).
            Rank: ${rank || 'Not found'}. AI Content Present: ${isAiPresent}.
            Competitors: ${competitors.slice(0,3).map(c => c.title).join(', ')}.
            Give 1 actionable tip (max 20 words) to improve visibility.
          `;
          
          const result = await model.generateContent(prompt);
          analysisText = result.response.text();
        } catch (err) {
          console.error("Gemini Error:", err);
          analysisText = "AI Analysis failed.";
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
        serpFeatures,
        competitors
      };

    } catch (error) {
      console.error(`Query failed: ${query}`, error);
      // Return safe fallback so other queries still succeed
      return {
        query,
        rank: null,
        url: targetUrl,
        history: [],
        aiOverview: { present: false, content: "Error" },
        serpFeatures: [],
        competitors: []
      };
    }
  });

  // Wait for all parallel jobs
  const results = await Promise.all(promises);

  return res.status(200).json({ status: 'completed', results });
}
