// Display names only. Seeds and original recording IDs remain unchanged.
const circuits = {
  8912: 'Saffron Park',
  2046: 'Coral Bay',
  73091: 'Cedar Valley',
  66103: 'Sunset Ridge',
  91827: 'Marina Loop',
  20260920: 'Golden Coast',
};
export const circuitName = (seed) => circuits[seed] || `Circuit ${seed}`;
