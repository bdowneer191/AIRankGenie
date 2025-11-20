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
    // The user requested "google-ai-mode-api"
    // According to docs, engine should be "google_ai_overview" for dedicated API
    // OR standard google search with params.
    // Let's stick to standard google search but potentially add specific parameters if needed.
    // However, the user specifically linked to "https://serpapi.com/google-ai-mode-api"
    // But for general rank tracking AND AI overview, usually "google" engine is best as it returns organic + features.
    // If we use "google_ai_overview" engine, we might miss organic results unless we make two calls or if SerpApi aggregates.
    //
    // Let's stick to "google" engine but log errors better.
    // The user error was "API request failed", likely due to non-200 from SerpApi.

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
      // Try to parse error details from SerpApi
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
