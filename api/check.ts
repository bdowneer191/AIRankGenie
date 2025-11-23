import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper: Fast Sentiment
const analyzeSentiment = (text: string, targetUrl: string) => {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();
  let brand = targetUrl;
  try { brand = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`).hostname.split('.')[0]; } catch (e) {}

  if (!lower.includes(brand)) return 'neutral';

  const positive = ['best', 'top', 'good', 'excellent', 'trusted'];
  const negative = ['worst', 'bad', 'slow', 'scam', 'avoid'];

  let score = 0;
  positive.forEach(w => { if (lower.includes(w)) score++; });
  negative.forEach(w => { if (lower.includes(w)) score--; });

  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { serpapi_id, targetUrl } = req.body;
  const apiKey = process.env.SERP_API_KEY;

  try {
    // Check SerpApi Archive
    const response = await fetch(`https://serpapi.com/searches/${serpapi_id}.json?api_key=${apiKey}`);
    const data = await response.json();

    // 1. Still Processing?
    if (response.status === 202 || data.search_metadata?.status === 'Processing') {
      return res.status(202).json({ status: 'processing' });
    }

    // 2. Done? Parse it.
    let rank = null;
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

    // AI Mode Rank
    if (!rank && data.sources) {
       data.sources.forEach((source: any, idx: number) => {
         if (source.link && source.link.includes(targetUrl)) rank = idx + 1;
       });
    }

    return res.status(200).json({
      status: 'complete',
      data: {
        rank,
        search_volume: 1000, // Mock
        ai_present: isAiPresent,
        ai_content: aiContent,
        ai_sentiment: analyzeSentiment(aiContent, targetUrl)
      }
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
