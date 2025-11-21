import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper: Delay function for rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
                 (data.ai_overview ? "AI Overview detected" : undefined)
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
        history: [], // Frontend handles history generation if missing, or we can mock it here
        aiOverview: {
          ...aiOverview,
          analysis
        },
        serpFeatures: Object.keys(data).filter(k =>
          ['ai_overview', 'people_also_ask', 'featured_snippet', 'knowledge_panel', 'local_results'].includes(k)
        ),
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
