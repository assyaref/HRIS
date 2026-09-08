/**
 * Pure calibration mathematics (Phase 10.7C-52B) — stateless, deterministic,
 * testable without the @vladmandic/human engine or image I/O.
 *
 * Extracts only the mathematical calculations from scripts/face-calibration.mjs
 * so they can be unit-tested in isolation. Engine I/O and image processing remain
 * in the script; these are pure functions only.
 */

/** Minimum requirements for reporting and recommendations (matches script) */
export const MIN_SUBJECTS_FOR_REPORT = 2;
export const MIN_IMAGES_PER_SUBJECT = 2;
export const MIN_PAIRS_FOR_STATS = 10;
export const MIN_SUBJECTS_FOR_RECOMMENDATION = 5;
export const MIN_PAIRS_FOR_RECOMMENDATION = 50;
export const MAX_COMPARISONS = 20000;

/**
 * Generate all genuine pairs (same subject, i < j to avoid duplicates).
 * Matches the exact algorithm in scripts/face-calibration.mjs.
 */
export function generateGenuinePairs<T>(embeddings: T[][]): Array<{ a: T; b: T }> {
  const pairs: Array<{ a: T; b: T }> = [];
  let totalPairs = 0;

  for (const subjectEmbeddings of embeddings) {
    for (let i = 0; i < subjectEmbeddings.length && totalPairs < MAX_COMPARISONS; i++) {
      for (let j = i + 1; j < subjectEmbeddings.length && totalPairs < MAX_COMPARISONS; j++) {
        pairs.push({ a: subjectEmbeddings[i], b: subjectEmbeddings[j] });
        totalPairs++;
      }
    }
  }

  return pairs;
}

/**
 * Generate all impostor pairs (different subjects, a < b to avoid duplicates).
 * Matches the exact algorithm in scripts/face-calibration.mjs.
 */
export function generateImpostorPairs<T>(embeddings: T[][]): Array<{ a: T; b: T }> {
  const pairs: Array<{ a: T; b: T }> = [];
  let totalPairs = 0;

  for (let a = 0; a < embeddings.length && totalPairs < MAX_COMPARISONS; a++) {
    for (let b = a + 1; b < embeddings.length && totalPairs < MAX_COMPARISONS; b++) {
      for (const ea of embeddings[a]) {
        for (const eb of embeddings[b]) {
          if (totalPairs >= MAX_COMPARISONS) break;
          pairs.push({ a: ea, b: eb });
          totalPairs++;
        }
      }
    }
  }

  return pairs;
}

/**
 * Evaluate FAR/FRR for a single threshold.
 * Matches evaluateThreshold() in scripts/face-calibration.mjs.
 */
export function evaluateThreshold(
  genuineScores: number[],
  impostorScores: number[],
  threshold: number
): { far: number; frr: number } {
  let falseAccepts = 0;
  for (const s of impostorScores) {
    if (s >= threshold) falseAccepts++;
  }

  let falseRejects = 0;
  for (const s of genuineScores) {
    if (s < threshold) falseRejects++;
  }

  return {
    far: impostorScores.length > 0 ? falseAccepts / impostorScores.length : Number.NaN,
    frr: genuineScores.length > 0 ? falseRejects / genuineScores.length : Number.NaN,
  };
}

/**
 * Calculate percentile (matches percentile() in scripts/face-calibration.mjs).
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

/**
 * Select balanced operating point: minimize |FAR - FRR|, tie-break to lower FAR,
 * then to lower threshold. Matches the exact sorting in scripts/face-calibration.mjs.
 */
export function selectBalancedOperatingPoint(
  rows: Array<{ t: number; far: number; frr: number }>
): { t: number; far: number; frr: number } {
  return [...rows].sort((x, y) => {
    const gapDiff = Math.abs(x.far - x.frr) - Math.abs(y.far - y.frr);
    if (gapDiff !== 0) return gapDiff;
    const farDiff = x.far - y.far;
    if (farDiff !== 0) return farDiff;
    return x.t - y.t;
  })[0];
}

/**
 * Check if dataset meets minimum requirements for a production recommendation.
 */
export function canRecommend(usableSubjects: number, genuineCount: number, impostorCount: number): boolean {
  return (
    usableSubjects >= MIN_SUBJECTS_FOR_RECOMMENDATION &&
    genuineCount >= MIN_PAIRS_FOR_RECOMMENDATION &&
    impostorCount >= MIN_PAIRS_FOR_RECOMMENDATION
  );
}

/**
 * Check if dataset is sufficient to report basic stats.
 */
export function canReportStats(genuineCount: number, impostorCount: number): boolean {
  return genuineCount >= MIN_PAIRS_FOR_STATS && impostorCount >= MIN_PAIRS_FOR_STATS;
}

/**
 * Check if a score is a match for the threshold (score >= threshold).
 * Reused from face-template.ts to maintain consistency.
 */
export function isMatch(score: number, threshold: number): boolean {
  if (!Number.isFinite(score) || !Number.isFinite(threshold)) return false;
  return score >= threshold;
}