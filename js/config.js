/* Application defaults. The initial config is derived from content/manifest.json. */

export const RATE_LIMITS = {
  commentRatePerMin: { min: 1, max: 60, default: 8 },
  reactionRatePerMin: { min: 0, max: 30, default: 3 }
};

export const FEED_SIZE = 20;

export function buildDefaultConfig(manifest, reactions) {
  const weights = {};
  for (const cat of manifest.categories) {
    weights[cat] = manifest.defaultWeights[cat] ?? 10;
  }
  if (manifest.defaultWeights.scene != null) {
    weights.scene = manifest.defaultWeights.scene;
  }
  const emojiSets = Object.keys(reactions.sets || {});
  return {
    running: false,
    classTitle: manifest.classTitle || "ScienceCare Academic Aid",
    youtubeUrl: manifest.youtubeUrl || "",
    commentRatePerMin: RATE_LIMITS.commentRatePerMin.default,
    reactionRatePerMin: RATE_LIMITS.reactionRatePerMin.default,
    weights,
    enabledCategories: [...manifest.categories],
    enabledEmojiSets: emojiSets,
    scene: null,
    liveViewerCount: 0,
    showPinned: true,
    manualTrigger: null
  };
}

export function mergeConfig(base, incoming) {
  if (!incoming || typeof incoming !== "object") return base;
  return {
    ...base,
    ...incoming,
    weights: { ...(base.weights || {}), ...(incoming.weights || {}) },
    enabledCategories: Array.isArray(incoming.enabledCategories)
      ? incoming.enabledCategories
      : base.enabledCategories,
    enabledEmojiSets: Array.isArray(incoming.enabledEmojiSets)
      ? incoming.enabledEmojiSets
      : base.enabledEmojiSets
  };
}
