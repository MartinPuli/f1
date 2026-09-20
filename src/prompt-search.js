// These are local edits to the current best prompt, not new model weights.
export const EDITS = {
  attack: {
    field: 'pace',
    value: 'attack',
    text: 'Prefer attack whenever aligned with the road and tire grip exceeds 0.5. The controller brakes for corners; do not switch to cautious merely because a bend is visible. Recover when off track or facing away.',
  },
  measured: {
    field: 'pace',
    value: 'measured',
    text: 'Use balanced pace in tight bends or close traffic, then attack on the exit. Recover when off track or facing away. Avoid cautious pace on a clear, aligned road.',
  },
  spend: {
    field: 'power',
    value: 'spend',
    text: 'Deploy above 10% battery whenever the lane ahead is clear or while passing. Harvest only while blocked or below 10%. Spend remaining battery on the final lap.',
  },
  reserve: {
    field: 'power',
    value: 'reserve',
    text: 'Harvest in tight bends and blocked traffic. Deploy on a clear exit or while passing above 25% battery; on the final lap deploy above 5%.',
  },
  hold: {
    field: 'lane',
    value: 'hold',
    text: 'Hold a clear lane and avoid repeated lane changes. Prefer center on open road. Change lanes only to avoid a blocked lane or complete a pass; never move into an occupied lane.',
  },
  pass: {
    field: 'lane',
    value: 'pass',
    text: 'Set up passes early when closing on a slower rival within 24 m. Take a clear side lane and hold it until safely ahead. Stay in lane alongside another car.',
  },
  concise: {
    field: 'wording',
    value: 'concise',
    text: 'Remove the original personality paragraph and keep the current explicit strategy priority and tested policy edits.',
  },
  full: {
    field: 'wording',
    value: 'full',
    text: 'Retain the driver’s original personality paragraph as context for the explicit strategy and policy edits.',
  },
};

export function mutatePrompt(incumbent, edit, version) {
  const change = EDITS[edit];
  if (!change) throw new Error('Unknown prompt edit.');
  const basePrompt = incumbent.basePrompt || incumbent.prompt;
  const tuning = { ...(incumbent.tuning || {}), [change.field]: change.value };
  let base = basePrompt;
  if (tuning.wording === 'concise' && base.includes('Current priority:'))
    base = base.split('Current priority:').at(-1).trim();
  const policies = ['pace', 'power', 'lane'].flatMap((field) => {
    const spec = Object.values(EDITS).find((e) => e.field === field && e.value === tuning[field]);
    return spec ? [spec.text] : [];
  });
  // Keep a complete strategy sentence if adding every policy would exceed the API limit.
  if ((base + policies.join(' ')).length > 930 && base.includes('Current priority:'))
    base = base.split('Current priority:').at(-1).trim();
  const prompt = `${base}${policies.length ? `\n\nPolicy overrides: ${policies.join(' ')}` : ''}`;
  if (prompt.length > 1000) throw new Error('Prompt edit exceeds the production limit.');
  return {
    ...incumbent,
    version,
    basePrompt,
    tuning,
    prompt,
    edit,
    comparedAgainst: incumbent.version,
  };
}

export function availableEdits(incumbent, tried = []) {
  return Object.fromEntries(
    Object.entries(EDITS)
      .filter(([id, edit]) => {
        if (tried.includes(id)) return false;
        const current =
          incumbent.tuning?.[edit.field] || (edit.field === 'wording' ? 'full' : null);
        if (current === edit.value) return false;
        try {
          return mutatePrompt(incumbent, id, 'test').prompt !== incumbent.prompt;
        } catch {
          return false;
        }
      })
      .map(([id, edit]) => [id, edit.text]),
  );
}

export function comparePairs(incumbent, challenger, samePrompt = false, pairs = 4) {
  if (![4, 8].includes(pairs) || incumbent.length !== pairs || challenger.length !== pairs)
    throw new Error('A complete set of four or eight pairs is required.');
  if ([...incumbent, ...challenger].some((d) => !Number.isFinite(d.score)))
    throw new Error('Missing paired score.');
  const before = incumbent.reduce((sum, d) => sum + d.score, 0) / pairs;
  const after = challenger.reduce((sum, d) => sum + d.score, 0) / pairs;
  const wins = challenger.filter((d, i) => d.score < incumbent[i].score).length;
  const unfinishedBefore = incumbent.filter((d) => !d.finished).length;
  const unfinishedAfter = challenger.filter((d) => !d.finished).length;
  return {
    samePrompt,
    before,
    after,
    wins,
    pairs,
    unfinishedBefore,
    unfinishedAfter,
    accepted:
      !samePrompt &&
      after < before * 0.995 &&
      wins >= pairs - 1 &&
      unfinishedAfter <= unfinishedBefore,
  };
}
