// Shared scoring for ai_models empirical tests.
// Spec: primebrick-be-v3/docs/modules/ai-models.md ("Scoring formulas").
//
// Usage:
//   import { computeModelScore } from './ai-model-score.mjs';
//   const { quality, speed, score, rank, speedGate }
//     = computeModelScore([{ score: 5, response_s: 4.2 }, ...]);

// Per-turn speed score from real response time in seconds.
// A turn that timed out or errored counts as response_s = 90 (=> 0).
export function speedScore(response_s) {
  if (response_s == null || response_s > 10 || response_s === 'timeout') return 0;
  if (response_s <= 3) return 5;
  if (response_s <= 5) return 4;
  if (response_s <= 7) return 3;
  if (response_s <= 9) return 2;
  return 1; // <= 10
}

// turns: [{ score: 5|3|2|0, response_s: number|'timeout' }]
// 5=correct, 3=compiles+semantically close but linguistic misunderstanding,
// 2=compiles but semantically wrong, 0=total failure
export function computeModelScore(turns) {
  const total = turns.length;
  const qualityMean = turns.reduce((a, t) => a + t.score, 0) / total;
  const success = turns.filter(t => t.score >= 4).length;
  const timeouts = turns.filter(
    t => t.response_s === 'timeout' || t.response_s >= 90
  ).length;

  const quality = qualityMean * 0.6 + (success / total) * 5 * 0.4;
  const speed = turns.reduce((a, t) => a + speedScore(t.response_s), 0) / total;
  const score = quality * 0.8 + speed * 0.2;

  return {
    quality: Math.round(quality * 100) / 100,
    speed: Math.round(speed * 100) / 100,
    score: Math.round(score * 100) / 100,
    rank: Math.round(score * 10) / 10,
    // hard gate: >=2 of 5 turns timed out => unusable regardless of quality
    speedGate: timeouts >= 2,
  };
}
