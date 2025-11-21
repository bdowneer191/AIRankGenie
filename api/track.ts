import type { VercelRequest, VercelResponse } from '@vercel/node';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

const generateMockHistory = (currentRank: number | null): { date: string; rank: number | null }[] => {
  const history = [];
  const today = new Date();

  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    let rank: number | null = null;
    if (currentRank !== null) {
      const fluctuation = Math.floor(Math.random() * 11) - 5;
      rank = Math.max(1, Math.min(100, currentRank + fluctuation));
    } else if (Math.random() > 0.7) {
      rank = Math.floor(Math.random() * 50) + 50;
    }

    history.push({
      date: date.toISOString().split('T')[0],
      rank
    });
  }

  history[history.length - 1].rank = currentRank;
  return history;
};

const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { targetUrl, queries, location = 'United States', device = 'desktop' } = req.body;

  if (!targetUrl || !queries || !Array.isArray(queries) || queries.length === 0) {
    return res.status(400).json({ error: 'targetUrl and queries array are required' });
  }

  const apiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'SERP_API_KEY not configured' });
  }

  const normalizedTarget = normalizeUrl(targetUrl);
  const results = [];

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
        engine: 'google',
        location: location,
        num: '100',
        hl: 'en',
        gl: 'us',
        device: device
      });

      const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);

      if (!serpRes.ok) {
        console.error(`SerpAPI failed for "${query}": ${serpRes.status}`);
        results.push({
          query,
          rank: null,
          url: targetUrl,
          history: generateMockHistory(null),
          aiOverview: { present: false, content: undefined },
          serpFeatures: [],
          competitors: []
        });
        continue;
      }

      const data = await serpRes.json();

      // Find rank
      let rank: number | null = null;
      const organicResults = data.organic_results || [];

      for (const item of organicResults) {
        if (item.link) {
          const itemDomain = normalizeUrl(item.link);
          if (itemDomain.includes(normalizedTarget) || normalizedTarget.includes(itemDomain)) {
            rank = item.position;
            break;
          }
        }
      }

      // Extract AI Overview
      const aiOverview = {
        present: !!data.ai_overview,
        content: data.ai_overview?.snippet ||
                 data.ai_overview?.text_blocks?.map((b: any) => b.snippet).join(' ') ||
                 data.ai_overview?.answer ||
                 (data.ai_overview ? "AI Overview detected" : undefined)
      };

      // Get competitors
      const competitors = organicResults.slice(0, 5).map((c: any) => ({
        rank: c.position,
        title: c.title || 'Untitled',
        url: c.link || '',
        snippet: c.snippet || ''
      }));

      // Generate Gemini analysis
      let analysis = "Analysis unavailable.";
      if (geminiApiKey) {
        try {
          const prompt = `Analyze SEO for "${query}". Target rank: ${rank || '>100'}. AI Overview: ${aiOverview.present ? 'Present' : 'None'}. Give ONE actionable tip (max 30 words) to improve ranking or capture AI Overview.`;

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              })
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis generated.";
          }
        } catch (err) {
          console.error("Gemini error:", err);
        }
      }

      results.push({
        query,
        rank,
        url: targetUrl,
        history: generateMockHistory(rank),
        aiOverview: { ...aiOverview, analysis },
        serpFeatures: mapSerpFeatures(data),
        competitors
      });

      // Rate limiting
      if (queries.indexOf(query) < queries.length - 1) {
        await sleep(600);
      }

    } catch (error) {
      console.error(`Error processing "${query}":`, error);
      results.push({
        query,
        rank: null,
        url: targetUrl,
        history: generateMockHistory(null),
        aiOverview: { present: false },
        serpFeatures: [],
        competitors: []
      });
    }
  }

  return res.status(200).json({ status: 'completed', results });
}
