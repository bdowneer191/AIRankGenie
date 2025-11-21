import { TrackingResult } from "../types";

export const analyzeResultWithGemini = async (result: TrackingResult): Promise<string> => {
  // The backend now pre-calculates the analysis during the tracking job.
  // We simply return it here to maintain compatibility with the UI.
  
  // Simulate a short delay for UX consistency if desired, or return immediately.
  // Returning immediately is better for performance.

  if (result.aiOverview && result.aiOverview.analysis) {
    return result.aiOverview.analysis;
  }

  return "Analysis unavailable. The backend did not return an analysis for this result.";
};
