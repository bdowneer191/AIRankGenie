import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, location = 'United States', device = 'desktop' } = req.body;
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'SERP_API_KEY is not configured' });
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
      throw new Error(`SERP API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('SERP API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch SERP data' });
  }
}
