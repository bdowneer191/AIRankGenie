import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper: Delay function for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Map raw SerpAPI keys to user-friendly feature names
const mapSerpFeatures = (data: any): string[] => {
  const featureMap: Record<string, string> = {
    'ai_overview': 'AI Overview',
    'featured_snippet': 'Featured Snippet',
    'people_also_ask': 'People Also Ask',
    'knowledge_panel': 'Knowledge Panel',
    'local_results': 'Local Pack',
    'top_stories': 'Top Stories',
    'video_results': 'Videos',
    'image_results': 'Images',
    'shopping_results': 'Shopping',
    'sitelinks': 'Sitelinks'
  };

  const features: string[] = [];
  for (const key of Object.keys(featureMap)) {
    if (data[key]) {
      features.push(featureMap[key]);
    }
  }
  return features;
};

// Helper: Generate mock historical data
const generateMockHistory = (currentRank: number | null): { date: string; rank: number | null }[] => {
  const history = [];
  const today = new Date();

  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    let rank: number | null = null;
    if (currentRank !== null) {
      // Simulate rank fluctuation within ±5 positions
      const fluctuation = Math.floor(Math.random() * 11) - 5;
      rank = Math.max(1, Math.min(100, currentRank + fluctuation));
    } else if (Math.random() > 0.7) {
      // 30% chance of having been ranked before
      rank = Math.floor(Math.random() * 50) + 50;
    }

    history.push({
      date: date.toISOString().split('T')[0],
      rank
    });
  }

  // Ensure last entry matches current rank
  history[history.length - 1].rank = currentRank;

  return history;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { targetUrl, queries, location = 'United States' } = req.body;

  if (!targetUrl || !queries || !Array.isArray(queries)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const apiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('SERP_API_KEY missing');
    return res.status(500).json({ error: 'Server configuration error (Missing SERP_API_KEY)' });
  }

  const results = [];

  try {
    for (const query of queries) {
      console.log(`Processing query: ${query}`);

      // 1. Call SerpApi
      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
        engine: 'google',
        location: location,
        num: '100',
        hl: 'en',
        gl: 'us',
      });

      const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);

      if (!serpRes.ok) {
        console.error(`SerpAPI failed for query "${query}": ${serpRes.status} ${serpRes.statusText}`);
        // Push a failed result or continue
        results.push({
            query,
            rank: null,
            url: targetUrl,
            history: [],
            aiOverview: { present: false, content: "Search failed" },
            serpFeatures: [],
            competitors: []
        });
        continue;
      }

      const data = await serpRes.json();

      // 2. Extract Organic Rank
      let rank = null;
      const organicResults = data.organic_results || [];
      const foundItem = organicResults.find((item: any) => item.link && item.link.includes(targetUrl));
      if (foundItem) {
        rank = foundItem.position;
      }

      // 3. Extract AI Overview Data
      // SerpApi returns 'ai_overview' object
      const aiOverview = {
        present: !!data.ai_overview,
        content: data.ai_overview?.snippet ||
                 data.ai_overview?.text_blocks?.map((b: any) => b.snippet).join(' ') ||
                 data.ai_overview?.answer ||
                 (data.ai_overview ? "AI Overview detected but content unavailable" : undefined)
      };

      // 4. Extract Competitors
      const competitors = organicResults.slice(0, 3).map((c: any) => ({
        rank: c.position,
        title: c.title,
        url: c.link,
        snippet: c.snippet
      }));

      // 5. Analyze with Gemini (REST API)
      let analysis = "Analysis unavailable.";
      if (geminiApiKey) {
        try {
          const prompt = `
            Analyze SEO performance for query: "${query}".
            Target URL: ${targetUrl}
            Rank: ${rank || '>100'}
            AI Overview: ${aiOverview.present ? 'Yes' : 'No'}

            Top 3 Competitors:
            ${competitors.map((c: any) => `- ${c.title}`).join('\n')}

            Provide 1 concise strategy (max 30 words) to capture the AI Overview or improve rank.
          `;

          // Using gemini-1.5-flash as a standard/reliable model for now.
          const model = "gemini-1.5-flash";
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          });

          if (geminiRes.ok) {
             const geminiData = await geminiRes.json();
             analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis generated.";
          } else {
             console.warn("Gemini API call failed:", await geminiRes.text());
          }
        } catch (err) {
          console.error("Gemini Error:", err);
        }
      }

      results.push({
        query,
        rank,
        url: targetUrl,
        history: generateMockHistory(rank),
        aiOverview: {
          ...aiOverview,
          analysis
        },
        serpFeatures: mapSerpFeatures(data),
        competitors
      });

      // Rate limit / prevent timeout if many queries?
      // Vercel limits execution time. If queries > 3, we might hit 10s limit.
      // But we proceed as requested.
      if (queries.length > 1) await sleep(500);
    }

    return res.status(200).json({ status: 'completed', results });

  } catch (error) {
    console.error('Tracking processing error:', error);
    return res.status(500).json({ error: 'Failed to process tracking job' });
  }
}
