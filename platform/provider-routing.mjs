/**
 * Phase 2 provider routing baseline.
 * Keeps selection deterministic and explainable.
 */

export const TASK_REQUIREMENTS = {
  offer_analysis: { rewrite: 2, reasoning: 4, structuredOutput: 3, preferredKinds: ['managed', 'byok', 'local'] },
  profile_rewrite: { rewrite: 4, reasoning: 2, structuredOutput: 2, preferredKinds: ['local', 'managed', 'byok'] },
  cv_targeting: { rewrite: 4, reasoning: 3, structuredOutput: 3, preferredKinds: ['managed', 'byok', 'local'] },
  deep_research: { rewrite: 2, reasoning: 5, structuredOutput: 2, preferredKinds: ['managed', 'byok', 'local'] }
};

export const SUPPORTED_PRIVACY_MODES = new Set([
  'balanced',
  'privacy_preferred',
  'high_privacy',
  'strict_local'
]);

function supportsTask(provider, requirement) {
  const caps = provider.capabilities ?? {};
  return (
    (caps.rewrite ?? 0) >= requirement.rewrite &&
    (caps.reasoning ?? 0) >= requirement.reasoning &&
    (caps.structuredOutput ?? 0) >= requirement.structuredOutput
  );
}

function getProviderPrivacyLevel(provider) {
  const caps = provider.capabilities ?? {};
  const raw = provider.privacyLevel ?? caps.privacyLevel;
  if (Number.isFinite(raw)) {
    return Math.max(1, Math.min(3, Number(raw)));
  }
  if (provider.kind === 'local') return 3;
  if (provider.kind === 'byok') return 2;
  return 1;
}

function scoreProvider(provider, requirement, privacyMode) {
  const caps = provider.capabilities ?? {};
  let score = 0;
  score += (caps.rewrite ?? 0) * 2;
  score += (caps.reasoning ?? 0) * 3;
  score += (caps.structuredOutput ?? 0) * 2;
  const privacyLevel = getProviderPrivacyLevel(provider);
  if (privacyMode === 'high_privacy') {
    score += privacyLevel * 6;
  } else if (privacyMode === 'privacy_preferred') {
    score += privacyLevel * 4;
  } else {
    score += privacyLevel * 2;
  }
  const kindIndex = requirement.preferredKinds.indexOf(provider.kind);
  score += kindIndex === -1 ? 0 : (requirement.preferredKinds.length - kindIndex) * 5;
  return score;
}

function filterByPrivacyMode(providers, privacyMode) {
  if (privacyMode === 'strict_local') {
    return providers.filter((provider) => provider.kind === 'local');
  }
  if (privacyMode === 'high_privacy') {
    return providers.filter((provider) => getProviderPrivacyLevel(provider) >= 2);
  }
  return providers;
}

export function selectProviderForTask({
  task,
  privacyMode = 'balanced',
  providers = []
}) {
  const requirement = TASK_REQUIREMENTS[task];
  if (!requirement) {
    throw new Error(`Unsupported task: ${task}`);
  }
  if (!SUPPORTED_PRIVACY_MODES.has(privacyMode)) {
    throw new Error(`Unsupported privacyMode: ${privacyMode}`);
  }
  for (const provider of providers) {
    if (typeof provider.id !== 'string' || provider.id.trim().length === 0) {
      throw new Error(`Invalid provider id for task=${task}`);
    }
  }

  const available = providers.filter((provider) => provider.available !== false);
  const privacyScoped = filterByPrivacyMode(available, privacyMode);
  const compatible = privacyScoped.filter((provider) => supportsTask(provider, requirement));

  if (compatible.length === 0) {
    return {
      primary: null,
      fallbacks: [],
      reason: `No compatible provider for task=${task} privacyMode=${privacyMode}`
    };
  }

  const ranked = [...compatible].sort((a, b) => {
    const scoreDiff = scoreProvider(b, requirement, privacyMode) - scoreProvider(a, requirement, privacyMode);
    if (scoreDiff !== 0) return scoreDiff;
    return a.id.localeCompare(b.id);
  });

  return {
    primary: ranked[0].id,
    fallbacks: ranked.slice(1).map((provider) => provider.id),
    reason: `Selected ${ranked[0].id} for task=${task} privacyMode=${privacyMode} (privacyLevel=${getProviderPrivacyLevel(ranked[0])})`
  };
}
