import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { targetUrl, queries, location = 'United States', device = 'desktop', searchMode = 'google' } = req.body;

    const apiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'SERP_API_KEY missing' });

    const normalizedTarget = normalizeUrl(targetUrl);

    // Parallel processing for the small batch received (usually 1-3 items)
    const promises = queries.map(async (query: string) => {
      try {
        // Engine Selection
        const engineMap: Record<string, string> = {
          'google': 'google',
          'google_ai_mode': 'google_ai_mode',
          'google_ask_ai': 'google_ask_ai'
        };
        const engine = engineMap[searchMode] || 'google';

        const params = new URLSearchParams({
          q: query,
          api_key: apiKey,
          engine: engine,
          location: location,
          num: '20',
          hl: 'en',
          gl: 'us',
          device: device
        });

        const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);
        if (!serpRes.ok) throw new Error(`SerpAPI: ${serpRes.statusText}`);
        const data = await serpRes.json();

        // Result Parsing
        let rank: number | null = null;
        let aiContent = "";
        let isAiPresent = false;
        const competitors: any[] = [];
        const features: string[] = [];

        if (data.ai_overview) features.push("AI Overview");
        if (data.ask_ai_result) features.push("Ask AI");

        // Logic per mode
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
        } else if (searchMode === 'google_ai_mode') {
          isAiPresent = true;
          aiContent = data.text_blocks?.[0]?.snippet || "AI Mode Result";
          const sources = data.sources || data.references || [];
          sources.forEach((source: any, i: number) => {
             competitors.push({ rank: i + 1, title: source.title, url: source.link, snippet: source.snippet });
             if (source.link && normalizeUrl(source.link).includes(normalizedTarget)) rank = i + 1;
          });
        }

        // Gemini Analysis
        let analysisText = "Analysis pending...";
        if (geminiApiKey) {
          try {
            const googleGenAI = new GoogleGenAI({ apiKey: geminiApiKey });
            const model = googleGenAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Analyze ranking for "${query}". Rank: ${rank}. AI Present: ${isAiPresent}. One short tip.`;
            const result = await model.generateContent(prompt);
            analysisText = result.response.text();
          } catch (e) { console.error("Gemini Error", e); }
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
        console.error(`Query Error (${query}):`, error.message);
        return {
          query, rank: null, url: targetUrl, history: [],
          aiOverview: { present: false, content: "Error" },
          serpFeatures: [], competitors: []
        };
      }
    });

    const results = await Promise.all(promises);
    return res.status(200).json({ status: 'completed', results });

  } catch (error: any) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
