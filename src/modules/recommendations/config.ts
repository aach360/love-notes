/**
 * Every tunable of the hybrid recommender in one place.
 * These are hand-picked heuristics for a hackathon demo, NOT fitted or proven optimal.
 */
export const REC_CONFIG = {
  /** Version of the feature mapping. Changing dims/projection must bump this (bandit state resets). */
  featureVersion: "linucb-f59-v2",
  /** Dimension of the semantic vectors the server sends (random projection of the full embedding). */
  semanticDims: 64,
  /** Bandit feature layout: 24 projected semantic + one dim per taxonomy topic (no hash collisions) + 4 context + 1 intercept. */
  banditSemanticDims: 24,
  /** Ridge regularization λ (A starts as λI). */
  lambda: 1.0,
  /** LinUCB exploration strength α. */
  alpha: 0.6,
  /** Exploration bonus is clamped so it can't dominate strong preferences. */
  maxExploration: 0.6,
  weights: { semantic: 1.0, predicted: 0.8, exploration: 0.35, time: 0.4, interest: 0.7, jitter: 0.05 },
  /** Passes are weaker evidence than likes (timing, not dislike). */
  negativeWeight: 0.3,
  /** Blend of full-session vs recent likes in the positive profile. */
  recentLikes: 5,
  recentBlend: 0.4,
  /** Shrinkage k: personalization weight = n / (n + k). */
  shrinkK: 3,
  /** MMR diversity reranking over the top candidates. */
  mmrPool: 40,
  mmrLambda: 0.75,
  /** Explanation thresholds on score contributions. */
  explainSemanticMin: 0.12,
  soonHours: 24,
  /**
   * Exploration slot policy (initial heuristic, not tuned): ~rate of displayed cards are
   * "Something new to try" picks, never two in a row. Topics with >= suppressAfterPasses
   * exploratory passes (and no likes) stop being explored; one pass is only a small penalty.
   */
  exploration: { rate: 0.15, suppressAfterPasses: 2, passPenalty: 0.15, adjacentBonus: 0.1, maxSeenForNew: 1 },
} as const;
