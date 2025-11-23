import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { targetUrl, queries, location = 'United States', searchMode = 'google' } = req.body;
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    // Fail-safe: If frontend sends too many, only take the first one to prevent timeout
    const singleQuery = queries[0];

    const params = new URLSearchParams({
      q: singleQuery,
      api_key: apiKey,
      engine: searchMode === 'google_ai_mode' ? 'google_ai_mode' : 'google',
      location,
      gl: 'us',
      hl: 'en',
      num: '10' // Reduce results to 10 to speed up SerpApi response
    });

    // 5-second timeout for the external fetch to ensure we respond to Vercel in time
    // Using 8000ms (8s) as hard limit before Vercel's 10s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!serpRes.ok) throw new Error(`SerpApi Error: ${serpRes.statusText}`);

    const data = await serpRes.json();

    // --- Quick Parsing ---
    let rank: number | null = null;
    let aiContent = "";
    let isAiPresent = false;

    // Detect AI
    if (data.ai_overview?.snippet) {
      isAiPresent = true;
      aiContent = data.ai_overview.snippet;
    } else if (data.text_blocks) {
      isAiPresent = true;
      aiContent = data.text_blocks.map((b: any) => b.snippet).join(' ');
    }

    // Detect Rank
    const organic = data.organic_results || [];
    for (const item of organic) {
      if (item.link && item.link.includes(targetUrl)) {
        rank = item.position;
        break;
      }
    }

    // Construct Result
    const result = {
      query: singleQuery,
      rank,
      url: targetUrl,
      searchVolume: 1000, // Mock volume to save time
      aiOverview: {
        present: isAiPresent,
        content: aiContent,
        sentiment: 'neutral' // Move sentiment analysis to frontend to save backend CPU time
      }
    };

    return res.status(200).json({ results: [result] });

  } catch (error: any) {
    console.error("Track API Error:", error);
    return res.status(500).json({ error: error.message || 'Timeout or Server Error' });
  }
}
