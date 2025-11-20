import { TrackingResult } from "../types";

export const analyzeResultWithGemini = async (result: TrackingResult): Promise<string> => {
  // We now use the proxy to keep keys secure
  
  try {
    const prompt = `
      Analyze the following SEO performance data for the query "${result.query}".
      
      Target URL: ${result.url}
      Current Rank: ${result.rank ? result.rank : 'Not in top 100'}
      AI Overview Present: ${result.aiOverview.present ? 'Yes' : 'No'}
      ${result.aiOverview.content ? `AI Overview Content: "${result.aiOverview.content}"` : ''}
      
      Competitors in top 3:
      ${result.competitors.slice(0, 3).map(c => `- #${c.rank} ${c.title} (${c.url})`).join('\n')}

      Provide a concise strategic insight (max 2 sentences) on how to improve ranking or capture the AI overview.
    `;

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }

    const data = await response.json();
    return data.text || "No analysis generated.";

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Analysis unavailable (Check API Key configuration).";
  }
};
