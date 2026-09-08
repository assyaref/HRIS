/**
 * PHASE 10.7C-52B — Calibration correctness tests (node:test).
 *
 * Unit tests for the pure mathematical logic in lib/attendance/calibration.ts
 * that powers scripts/face-calibration.mjs. These tests run without images,
 * without the @vladmandic/human engine, and without a real dataset — they
 * validate only the calculations.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  generateGenuinePairs,
  generateImpostorPairs,
  evaluateThreshold,
  percentile,
  selectBalancedOperatingPoint,
  canRecommend,
  canReportStats,
  isMatch,
  MAX_COMPARISONS,
  MIN_SUBJECTS_FOR_RECOMMENDATION,
  MIN_PAIRS_FOR_RECOMMENDATION,
} from "../../lib/attendance/calibration";

describe("calibration: genuine pair generation", () => {
  it("generates correct i<j pairs for single subject with 3 embeddings", () => {
    const embeddings = [[0.1, 0.2, 0.3]];
    const pairs = generateGenuinePairs(embeddings);
    assert.equal(pairs.length, 3);
    assert.deepEqual(pairs[0], { a: 0.1, b: 0.2 });
    assert.deepEqual(pairs[1], { a: 0.1, b: 0.3 });
    assert.deepEqual(pairs[2], { a: 0.2, b: 0.3 });
  });

  it("generates correct i<j pairs for two subjects", () => {
    // A1, A2, A3; B1, B2
    const embeddings = [[0.1, 0.2, 0.3], [0.4, 0.5]];
    const pairs = generateGenuinePairs(embeddings);
    // 3 from A (A1-A2, A1-A3, A2-A3) + 1 from B (B1-B2) = 4
    assert.equal(pairs.length, 4);
  });

  it("never generates self-pairs (i===j)", () => {
    const embeddings = [[0.1, 0.2]];
    const pairs = generateGenuinePairs(embeddings);
    assert.equal(pairs.length, 1);
    assert.notEqual(pairs[0].a, pairs[0].b);
  });

  it("never generates cross-subject pairs in genuine", () => {
    const embeddings = [[0.1], [0.2]]; // need >=2 per subject to generate
    const pairs = generateGenuinePairs(embeddings);
    assert.equal(pairs.length, 0); // can't generate pairs with <2 per subject
  });
});

describe("calibration: impostor pair generation", () => {
  it("generates all cross-subject combinations for two subjects", () => {
    // A1, A2; B1, B2
    const embeddings = [[0.1, 0.2], [0.3, 0.4]];
    const pairs = generateImpostorPairs(embeddings);
    // 2*2 = 4 combinations: A1-B1, A1-B2, A2-B1, A2-B2
    assert.equal(pairs.length, 4);
    const allCross = pairs.every(p =>
      (p.a === 0.1 || p.a === 0.2) && (p.b === 0.3 || p.b === 0.4)
    );
    assert.ok(allCross);
  });

  it("never generates same-subject pairs in impostor", () => {
    const embeddings = [[0.1, 0.2, 0.3], [0.4, 0.5]];
    const pairs = generateImpostorPairs(embeddings);
    // Cek bahwa tidak ada pasangan dari subject yang sama (0.1&0.2, 0.1&0.3, 0.2&0.3 dari subject pertama; 0.4&0.5 dari subject kedua)
    const hasSameSubject = pairs.some(p =>
      (p.a === 0.1 && p.b === 0.2) ||
      (p.a === 0.1 && p.b === 0.3) ||
      (p.a === 0.2 && p.b === 0.3) ||
      (p.a === 0.4 && p.b === 0.5)
    );
    assert.equal(hasSameSubject, false);
  });

  it("stops at MAX_COMPARISONS limit", () => {
    // Create enough subjects to exceed MAX_COMPARISONS
    const manyEmbeddings: number[][] = [];
    for (let i = 0; i < 100; i++) {
      manyEmbeddings.push([0.1, 0.2]); // 2 images per subject
    }
    const pairs = generateImpostorPairs(manyEmbeddings);
    assert.equal(pairs.length <= MAX_COMPARISONS, true);
  });
});

describe("calibration: duplicate prevention and limits", () => {
  it("never creates duplicate genuine pairs (i<j ensures uniqueness)", () => {
    const embeddings = [[0.1, 0.2, 0.3]];
    const pairs = generateGenuinePairs(embeddings);
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = `${p.a}-${p.b}`;
      assert.equal(seen.has(key), false);
      seen.add(key);
    }
  });

  it("never creates duplicate impostor pairs (a<b ensures uniqueness)", () => {
    const embeddings = [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]];
    const pairs = generateImpostorPairs(embeddings);
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = `${p.a}-${p.b}`;
      assert.equal(seen.has(key), false);
      seen.add(key);
    }
  });

  it("honors MAX_COMPARISONS for genuine pairs", () => {
    const embeddings: number[][] = [];
    for (let i = 0; i < 100; i++) {
      embeddings.push([0.1, 0.2, 0.3, 0.4, 0.5]);
    }
    const pairs = generateGenuinePairs(embeddings);
    assert.equal(pairs.length <= MAX_COMPARISONS, true);
  });
});

describe("calibration: threshold classification", () => {
  it("accepts score === threshold", () => {
    assert.equal(isMatch(0.5, 0.5), true);
  });

  it("accepts score > threshold", () => {
    assert.equal(isMatch(0.6, 0.5), true);
  });

  it("rejects score < threshold (T - epsilon)", () => {
    assert.equal(isMatch(0.4999, .5), false);
  });

  it("handles non-finite values safely", () => {
    assert.equal(isMatch(NaN, 0.5), false);
    assert.equal(isMatch(0.5, NaN), false);
    assert.equal(isMatch(Infinity, 0.5), false);
  });
});

describe("calibration: FAR calculation", () => {
  it("calculates correct FAR for example case", () => {
    const genuineScores = [0.4, 0.6, 0.7, 0.9];
    const impostorScores = [0.1, 0.4, 0.6, 0.8];
    const threshold = 0.5;
    const { far } = evaluateThreshold(genuineScores, impostorScores, threshold);
    // false accepts: 0.6, 0.8 → 2 / 4 = 0.5
    assert.equal(far, 0.5);
  });

  it("returns 0 FAR when no impostors pass", () => {
    const genuineScores = [0.8, 0.9];
    const impostorScores = [0.1, 0.2, 0.3];
    const { far } = evaluateThreshold(genuineScores, impostorScores, 0.5);
    assert.equal(far, 0);
  });

  it("returns 1 FAR when all impostors pass", () => {
    const genuineScores = [0.8, 0.9];
    const impostorScores = [0.6, 0.7, 0.8];
    const { far } = evaluateThreshold(genuineScores, impostorScores, 0.5);
    assert.equal(far, 1);
  });
});

describe("calibration: FRR calculation", () => {
  it("calculates correct FRR for example case", () => {
    const genuineScores = [0.4, 0.6, 0.7, 0.9];
    const impostorScores = [0.1, 0.4, 0.6, 0.8];
    const threshold = 0.5;
    const { frr } = evaluateThreshold(genuineScores, impostorScores, threshold);
    // false rejects: 0.4 → 1 / 4 = 0.25
    assert.equal(frr, 0.25);
  });

  it("returns 0 FRR when all genuine pass", () => {
    const genuineScores = [0.6, 0.7, 0.8];
    const impostorScores = [0.1, 0.2];
    const { frr } = evaluateThreshold(genuineScores, impostorScores, 0.5);
    assert.equal(frr, 0);
  });

  it("returns 1 FRR when all genuine fail", () => {
    const genuineScores = [0.1, 0.2, 0.3];
    const impostorScores = [0.6, 0.7];
    const { frr } = evaluateThreshold(genuineScores, impostorScores, 0.5);
    assert.equal(frr, 1);
  });
});

describe("calibration: threshold candidate evaluation", () => {
  it("evaluates multiple thresholds correctly", () => {
    const genuineScores = [0.4, 0.6, 0.7, 0.9];
    const impostorScores = [0.1, 0.4, 0.6, 0.8];

    const thresholds = [0.3, 0.5, 0.7];
    const results = thresholds.map(t => ({
      t,
      ...evaluateThreshold(genuineScores, impostorScores, t)
    }));

    // t=0.3: far=0.75 (3/4 impostors pass), frr=0 (0/4 genuine fail)
    assert.equal(results[0].far, 0.75);
    assert.equal(results[0].frr, 0);

    // t=0.5: far=0.5, frr=0.25 (from earlier examples)
    assert.equal(results[1].far, 0.5);
    assert.equal(results[1].frr, 0.25);

    // t=0.7: far=0.25 (only 0.8 passes), frr=0.5 (0.4,0.6 fail)
    assert.equal(results[2].far, 0.25);
    assert.equal(results[2].frr, 0.5);
  });
});

describe("calibration: balanced operating point selection", () => {
  it("selects threshold with minimal |FAR-FRR|", () => {
    const rows = [
      { t: 0.4, far: 0.6, frr: 0.1 }, // |0.5|
      { t: 0.5, far: 0.5, frr: 0.25 }, // |0.25|
      { t: 0.6, far: 0.3, frr: 0.4 }, // |0.1| → best
    ];
    const selected = selectBalancedOperatingPoint(rows);
    assert.equal(selected.t, 0.6);
  });

  it("tie-breaks to lower FAR when gaps are equal", () => {
    const rows = [
      { t: 0.55, far: 0.3, frr: 0.4 }, // gap 0.1, far=0.3
      { t: 0.5, far: 0.2, frr: 0.3 }, // gap 0.1, far=0.2 → wins tie-break
    ];
    const selected = selectBalancedOperatingPoint(rows);
    assert.equal(selected.t, 0.5);
    assert.equal(selected.far, 0.2);
  });

  it("tie-breaks to lower threshold when FAR is also equal", () => {
    const rows = [
      { t: 0.55, far: 0.25, frr: 0.35 },
      { t: 0.5, far: 0.25, frr: 0.35 }, // same gap, same far, lower t → wins
    ];
    const selected = selectBalancedOperatingPoint(rows);
    assert.equal(selected.t, 0.5);
  });
});

describe("calibration: percentile calculation", () => {
  it("calculates correct percentiles for sorted array", () => {
    const sorted = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    assert.equal(percentile(sorted, 0), 0.1); // min
    assert.equal(percentile(sorted, 0.5), 0.5); // median
    assert.equal(percentile(sorted, 1), 0.9); // max
    assert.equal(percentile(sorted, 0.25), 0.3); // p25
    assert.equal(percentile(sorted, 0.75), 0.7); // p75
  });

  it("handles empty array", () => {
    assert.ok(Number.isNaN(percentile([], 0.5)));
  });
});

describe("calibration: insufficient dataset handling", () => {
  it("rejects recommendation with insufficient subjects", () => {
    assert.equal(canRecommend(MIN_SUBJECTS_FOR_RECOMMENDATION - 1, 100, 100), false);
    assert.equal(canRecommend(MIN_SUBJECTS_FOR_RECOMMENDATION, 100, 100), true);
  });

  it("rejects recommendation with insufficient genuine pairs", () => {
    assert.equal(canRecommend(10, MIN_PAIRS_FOR_RECOMMENDATION - 1, 100), false);
    assert.equal(canRecommend(10, MIN_PAIRS_FOR_RECOMMENDATION, 100), true);
  });

  it("rejects recommendation with insufficient impostor pairs", () => {
    assert.equal(canRecommend(10, 100, MIN_PAIRS_FOR_RECOMMENDATION - 1), false);
    assert.equal(canRecommend(10, 100, MIN_PAIRS_FOR_RECOMMENDATION), true);
  });

  it("canReportStats only when both have enough pairs", () => {
    assert.equal(canReportStats(9, 10), false);
    assert.equal(canReportStats(10, 9), false);
    assert.equal(canReportStats(10, 10), true);
  });
});

describe("calibration: privacy output safety", () => {
  // This test audits that the calibration script's output never includes
  // sensitive biometric data. We read the script source and verify.
  it("calibration script never logs raw biometric data", () => {
    const scriptSource = readFileSync(path.join(process.cwd(), "scripts/face-calibration.mjs"), "utf8");
    // Should never log embedding, template, ciphertext, key, or image data
    const forbiddenPatterns = [
      /embedding.*console\.log/,
      /template.*console\.log/,
      /ciphertext.*console\.log/,
      /encryption.*key.*console\.log/,
      /imageBuffer.*console\.log/,
      /buffer.*console\.log.*(?!skipped)/,
    ];
    for (const pattern of forbiddenPatterns) {
      assert.equal(pattern.test(scriptSource), false,
        `Calibration script must not log sensitive data matching ${pattern}`);
    }
  });

  it("calibration script only outputs scalar/statistical metadata", () => {
    const scriptSource = readFileSync(path.join(process.cwd(), "scripts/face-calibration.mjs"), "utf8");
    // All console.log outputs should be statistical aggregates only
    // Verify no raw biometric data is ever printed
    assert.equal(scriptSource.includes("console.log(embedding)"), false);
    assert.equal(scriptSource.includes("console.log(image)"), false);
    assert.equal(scriptSource.includes("console.log(buffer)"), false);
  });
});

describe("calibration: threshold safety", () => {
  it("FACE_VERIFY_THRESHOLD remains 0.5 baseline in code", () => {
    const templateSource = readFileSync(path.join(process.cwd(), "lib/attendance/face-template.ts"), "utf8");
    assert.ok(templateSource.includes("FACE_VERIFY_DEFAULT_THRESHOLD = 0.5"));
  });

  it("calibration tool never modifies environment or writes files", () => {
    const scriptSource = readFileSync(path.join(process.cwd(), "scripts/face-calibration.mjs"), "utf8");
    // Never writes .env, never modifies process.env persistently
    assert.equal(scriptSource.includes("writeFileSync"), false);
    assert.equal(scriptSource.includes("appendFileSync"), false);
    assert.equal(scriptSource.includes("process.env.FACE_VERIFY_THRESHOLD ="), false);
  });

  it("calibration never bypasses readiness gate", () => {
    const presenceSource = readFileSync(path.join(process.cwd(), "features/attendance/attendance-presence.ts"), "utf8");
    // Readiness gate still requires explicit calibration validation
    assert.ok(presenceSource.includes("faceCalibrationValidated"));
    assert.ok(presenceSource.includes("livenessConfiguredAndValidated"));
  });
});
