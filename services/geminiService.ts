import { GoogleGenAI } from "@google/genai";
import { TrackingResult } from "../types";

export const analyzeResultWithGemini = async (result: TrackingResult): Promise<string> => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.warn("No API Key provided in environment variables.");
    return "Analysis unavailable: API Key configuration missing.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are an expert SEO strategist using data to provide actionable insights.",
        temperature: 0.7,
      }
    });

    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate analysis. Please check your API key.";
  }
};