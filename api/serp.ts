import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const { query, location = 'United States', device = 'desktop' } = req.body;

  const apiKey = process.env.SERP_API_KEY ||
                 process.env.SERPAPI_API_KEY ||
                 process.env.SERPAPI_KEY ||
                 process.env.serp_api ||
                 process.env.SERP_API;

  if (!apiKey) {
    console.error('Missing SERP_API_KEY');
    return res.status(500).json({
      error: 'SERP_API_KEY is not configured',
      message: 'Please set SERP_API_KEY in your Vercel Project Settings.'
    });
  }

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      engine: 'google',
      location: location,
      gl: 'us',
      hl: 'en',
      device: device,
      num: '100'
    });

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`SerpApi Failed: ${response.status} ${response.statusText} - ${errorBody}`);
      return res.status(response.status).json({
        error: `SerpApi error: ${response.statusText}`,
        details: errorBody
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('SERP API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch SERP data', details: (error as Error).message });
  }
}
