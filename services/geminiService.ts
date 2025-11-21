import { TrackingResult } from "../types";

export const analyzeResultWithGemini = async (result: TrackingResult): Promise<string> => {
  // First check if analysis already exists from backend
  if (result.aiOverview?.analysis && result.aiOverview.analysis !== "Analysis unavailable.") {
    return result.aiOverview.analysis;
  }

  // If not, make a direct call to the Gemini API
  try {
    const prompt = `
      Analyze this SEO data and provide ONE actionable strategy (max 40 words):

      Keyword: "${result.query}"
      Current Rank: ${result.rank || 'Not in top 100'}
      AI Overview Present: ${result.aiOverview?.present ? 'Yes' : 'No'}
      ${result.aiOverview?.present ? `AI Overview Content: "${result.aiOverview.content?.slice(0, 200)}..."` : ''}
      Top Competitors: ${result.competitors?.slice(0, 3).map(c => c.title).join(', ') || 'Unknown'}

      Focus on how to either rank higher or get featured in the AI Overview.
    `;

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      throw new Error('Gemini API call failed');
    }

    const data = await response.json();
    return data.text || "Unable to generate analysis.";

  } catch (error) {
    console.error('Gemini analysis error:', error);
    return "Analysis unavailable. Please check your Gemini API configuration.";
  }
};
