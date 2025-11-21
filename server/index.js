// server/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Initialize Gemini
// Note: If @google/genai package doesn't work as expected, ensure correct import.
// Assuming user provided code is correct for the installed package.
let genAI;
try {
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (e) {
    console.warn("Failed to initialize GoogleGenAI. Check API Key.", e);
}

// Helper: Delay function for rate limiting (Standard Practice)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/track', async (req, res) => {
  const { targetUrl, queries, location = 'United States' } = req.body;

  if (!targetUrl || !queries || !Array.isArray(queries)) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // In a production app, we would push this to a queue (e.g., BullMQ/Redis).
  // For this implementation, we process immediately but stream status updates
  // or return a job ID. To keep it compatible with your current frontend polling,
  // we will process one query at a time and return the full result array.

  const results = [];

  try {
    for (const query of queries) {
      console.log(`Processing query: ${query}`);

      // 1. Call SerpApi
      // We use 'engine=google' to get BOTH organic ranks and AI Overviews.
      // Ensure SERP_API_KEY is set
      if (!process.env.SERP_API_KEY) {
          throw new Error("SERP_API_KEY is not configured");
      }

      const serpResponse = await axios.get('https://serpapi.com/search', {
        params: {
          engine: 'google',
          q: query,
          api_key: process.env.SERP_API_KEY,
          location: location,
          num: 100, // Fetch top 100 to find rank
          hl: 'en',
          gl: 'us',
        }
      });

      const data = serpResponse.data;

      // 2. Extract Organic Rank
      let rank = null;
      const organicResults = data.organic_results || [];
      const foundItem = organicResults.find(item => item.link.includes(targetUrl));
      if (foundItem) {
        rank = foundItem.position;
      }

      // 3. Extract AI Overview Data
      // Based on SerpApi documentation, this is under 'ai_overview' or 'knowledge_graph'
      const aiOverview = {
        present: !!data.ai_overview,
        content: data.ai_overview?.snippet || data.ai_overview?.text_blocks?.[0]?.snippet || "AI Overview detected but no snippet text available."
      };

      // 4. Extract Competitors
      const competitors = organicResults.slice(0, 3).map(c => ({
        rank: c.position,
        title: c.title,
        url: c.link,
        snippet: c.snippet
      }));

      // 5. Analyze with Gemini (Server-Side)
      let analysis = "Analysis unavailable.";
      if (process.env.GEMINI_API_KEY && genAI) {
        try {
          const prompt = `
            Analyze SEO performance for query: "${query}".
            Target URL: ${targetUrl}
            Rank: ${rank || '>100'}
            AI Overview: ${aiOverview.present ? 'Yes' : 'No'}

            Top 3 Competitors:
            ${competitors.map(c => `- ${c.title}`).join('\n')}

            Provide 1 concise strategy (max 30 words) to capture the AI Overview or improve rank.
          `;

          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const result = await model.generateContent(prompt);
          // Check if result.response is a function or property depending on SDK version
          // Common SDK uses result.response.text()
          if (result.response && typeof result.response.text === 'function') {
             analysis = result.response.text();
          } else {
             // Fallback for different SDK versions
             analysis = JSON.stringify(result);
          }
        } catch (err) {
          console.error("Gemini Error:", err.message);
        }
      }

      results.push({
        query,
        rank,
        url: targetUrl,
        history: [], // History would normally come from a DB
        aiOverview: {
          ...aiOverview,
          analysis
        },
        serpFeatures: Object.keys(data).filter(k =>
          ['ai_overview', 'people_also_ask', 'featured_snippet', 'knowledge_panel', 'local_results'].includes(k)
        ),
        competitors
      });

      // Rate limit protection
      await sleep(1000);
    }

    res.json({ status: 'completed', results });

  } catch (error) {
    console.error('Tracking Error:', error.message);
    res.status(500).json({ error: 'Failed to process tracking job' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
