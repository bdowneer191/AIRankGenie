import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { jobId, queries, location, searchMode } = req.body;
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    // We launch requests in parallel because 'async=true' is instant
    const launched = await Promise.all(queries.map(async (q: string) => {
      const params = new URLSearchParams({
        q,
        api_key: apiKey,
        engine: searchMode === 'google_ai_mode' ? 'google_ai_mode' : 'google',
        location,
        gl: 'us',
        hl: 'en',
        async: 'true' // <--- THE MAGIC KEY (Returns instantly)
      });

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      return {
        job_id: jobId,
        query: q,
        serpapi_id: data.search_metadata.id, // The "Ticket"
        processing_status: 'pending',
        ai_present: false // Default
      };
    }));

    return res.status(200).json({ tasks: launched });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
