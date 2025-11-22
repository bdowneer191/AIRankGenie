import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- Helper: Heuristic Sentiment Analysis (Fast) ---
const analyzeSentiment = (text: string, targetUrl: string): 'positive' | 'negative' | 'neutral' => {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();
  
  // 1. Extract brand name from URL (e.g., "hypefresh" from "hypefresh.com")
  let brand = '';
  try {
    const hostname = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`).hostname;
    brand = hostname.split('.')[0];
  } catch (e) { brand = targetUrl; }

  if (!lower.includes(brand.toLowerCase())) return 'neutral';

  const positive = ['best', 'top', 'excellent', 'great', 'leading', 'trusted', 'recommended', 'quality'];
  const negative = ['worst', 'poor', 'bad', 'outdated', 'unreliable', 'problem', 'avoid', 'complaint'];

  let score = 0;
  positive.forEach(w => { if (lower.includes(w)) score++; });
  negative.forEach(w => { if (lower.includes(w)) score--; });

  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
};

// --- Helper: Search Volume Estimate (Mock - Replace with DataForSEO later if needed) ---
const estimateVolume = (q: string) => {
  const len = q.split(' ').length;
  if (len === 1) return 5000; // "Head" term
  if (len === 2) return 1200;
  return 250; // "Long tail"
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { targetUrl, queries, location = 'United States', searchMode = 'google' } = req.body;
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Server configuration error: Missing API Key' });

  try {
    // Process queries in parallel (Vercel Limit: 10s. Keep batch size small on frontend!)
    const results = await Promise.all(queries.map(async (query: string) => {
      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
        engine: searchMode === 'google_ai_mode' ? 'google_ai_mode' : 'google',
        location,
        gl: 'us',
        hl: 'en',
        num: '20'
      });

      const serpRes = await fetch(`https://serpapi.com/search?${params.toString()}`);
      const data = await serpRes.json();

      // --- Parsing Logic ---
      let rank: number | null = null;
      let aiContent = "";
      let isAiPresent = false;

      // 1. Detect AI
      if (data.ai_overview?.snippet) {
        isAiPresent = true;
        aiContent = data.ai_overview.snippet;
      } else if (data.text_blocks) {
        // AI Mode specific
        isAiPresent = true;
        aiContent = data.text_blocks.map((b: any) => b.snippet).join(' ');
      }

      // 2. Find Rank (Organic)
      const organic = data.organic_results || [];
      for (const item of organic) {
        if (item.link && item.link.includes(targetUrl)) {
          rank = item.position;
          break;
        }
      }

      // 3. AI Mode specific citations
      if (searchMode === 'google_ai_mode' && data.sources) {
        data.sources.forEach((source: any, idx: number) => {
           if (source.link && source.link.includes(targetUrl)) {
             rank = idx + 1; // "Citation Rank"
           }
        });
      }

      return {
        query,
        rank,
        url: targetUrl,
        searchVolume: estimateVolume(query),
        aiOverview: {
          present: isAiPresent,
          content: aiContent,
          sentiment: analyzeSentiment(aiContent, targetUrl)
        }
      };
    }));

    return res.status(200).json({ results });

  } catch (error: any) {
    console.error("Track API Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
