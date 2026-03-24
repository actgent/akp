import type { Maturity } from "./types.js";

/**
 * Compute maturity based on feedback counts.
 * Ported from hexaclaw-api/src/routes/wiki.ts computeMaturity()
 */
export function computeMaturity(
  currentMaturity: Maturity,
  helpfulCount: number,
  harmfulCount: number
): Maturity {
  const total = helpfulCount + harmfulCount;

  // Check for auto-deprecation first (harmful weighted 4x)
  if (total >= 5) {
    const weightedHarmful = harmfulCount * 4;
    const harmfulRatio = weightedHarmful / (helpfulCount + weightedHarmful);
    if (harmfulRatio > 0.4) {
      return "deprecated";
    }
  }

  // Don't promote deprecated articles via feedback
  if (currentMaturity === "deprecated") {
    return "deprecated";
  }

  // Progressive promotion
  if (helpfulCount >= 20 && total > 0) {
    const harmfulRatio = harmfulCount / total;
    if (harmfulRatio < 0.2) return "proven";
  }

  if (helpfulCount >= 8 && total > 0) {
    const harmfulRatio = harmfulCount / total;
    if (harmfulRatio < 0.25) return "established";
  }

  if (helpfulCount >= 3) {
    return "candidate";
  }

  return currentMaturity === "draft" ? "draft" : currentMaturity;
}
