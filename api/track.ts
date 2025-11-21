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

// --- Main Handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  console.log(`[${requestId}] 🚀 API Track Handler Started`);

  // 1. CORS Configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] ✅ OPTIONS request handled`);
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.warn(`[${requestId}] ❌ Method ${req.method} not allowed`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Input Parsing & Validation
    const { targetUrl, queries, location = 'United States', device = 'desktop', searchMode = 'google' } = req.body;

    console.log(`[${requestId}] 📥 Input Received:`, {
      targetUrl,
      queryCount: queries?.length,
      location,
      device,
      searchMode
    });

    if (!targetUrl || !queries || !Array.isArray(queries)) {
      console.error(`[${requestId}] ❌ Validation Error: Missing targetUrl or queries array`);
      return res.status(400).json({ error: 'Invalid input: targetUrl and queries array required' });
    }

    // 3. API Key Check
    const serpApiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    console.log(`[${requestId}] 🔑 Keys Check: SERP_KEY=${!!serpApiKey}, GEMINI_KEY=${!!geminiApiKey}`);

    if (!serpApiKey) {
      console.error(`[${requestId}] ❌ Critical: SERP API Key is missing in environment variables`);
      return res.status(500).json({ error: 'Server misconfiguration: SERP_API_KEY missing' });
    }

    const normalizedTarget = normalizeUrl(targetUrl);

    // 4. Processing Loop (Parallel)
    console.log(`[${requestId}] 🔄 Starting processing for ${queries.length} queries...`);

    const promises = queries.map(async (query: string, index: number) => {
      const qId = `${requestId}-q${index}`;
      try {
        console.log(`[${qId}] 🔎 Processing "${query}" (Mode: ${searchMode})`);

        // Determine Engine
        const engineMap: Record<string, string> = {
          'google': 'google',
          'google_ai_mode': 'google_ai_mode',
          'google_ask_ai': 'google_ask_ai'
        };
        const engine = engineMap[searchMode] || 'google';

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
        console.log(`[${qId}] 🌐 Calling SerpAPI...`);
        const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);
        
        if (!serpRes.ok) {
          const errText = await serpRes.text();
          console.error(`[${qId}] ❌ SerpAPI Error (${serpRes.status}): ${errText}`);
          throw new Error(`SerpAPI Error: ${serpRes.status}`);
        }
        
        const data = await serpRes.json();
        console.log(`[${qId}] ✅ SerpAPI Success. Organic results: ${data.organic_results?.length || 0}`);

        // Parse Results
        let rank: number | null = null;
        let aiContent = "";
        let isAiPresent = false;
        const competitors: any[] = [];
        const features: string[] = [];

        // Feature Detection
        if (data.ai_overview) features.push("AI Overview");
        if (data.ask_ai_result) features.push("Ask AI");

        // Strategy: Standard Google
        if (searchMode === 'google' || searchMode === 'google_ask_ai') {
          if (data.ai_overview) {
            isAiPresent = true;
            aiContent = data.ai_overview.snippet || "AI Overview detected";
          }
          if (data.ask_ai_result) {
             isAiPresent = true;
             aiContent = data.ask_ai_result.snippet || "Ask AI Result detected";
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

        // 5. Gemini Analysis
        let analysisText = "Analysis unavailable.";
        if (geminiApiKey) {
          try {
            console.log(`[${qId}] 🤖 Calling Gemini Analysis...`);
            // Use a unique variable name to prevent ANY shadow declaration issues
            const googleGenAIClient = new GoogleGenAI({ apiKey: geminiApiKey });
            const model = googleGenAIClient.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `
              Role: SEO Expert.
              Task: Analyze result for "${query}" in mode "${searchMode}".
              Data: Rank: ${rank || 'Not ranked'}. AI Present: ${isAiPresent}.
              Competitors: ${competitors.slice(0,3).map(c => c.title).join(', ')}.
              Output: One specific actionable tip (max 20 words) to improve visibility.
            `;
            
            const result = await model.generateContent(prompt);
            analysisText = result.response.text();
            console.log(`[${qId}] ✨ Gemini Analysis Generated`);
          } catch (err: any) {
            console.error(`[${qId}] ⚠️ Gemini Error:`, err.message);
            analysisText = "AI Analysis failed temporarily.";
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
        console.error(`[${qId}] 💥 Query Processing Crash:`, error.message);
        // Return safe fallback
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
    console.log(`[${requestId}] 🎉 All queries finished. Sending 200 OK.`);
    
    return res.status(200).json({ status: 'completed', results });

  } catch (criticalError: any) {
    console.error(`[${requestId}] 🔥 FATAL SERVER ERROR:`, criticalError);
    return res.status(500).json({ 
      error: "Internal Server Error", 
      details: criticalError.message 
    });
  }
}
