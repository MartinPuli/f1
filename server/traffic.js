// Shared limits are enforced in Postgres; process memory only makes repeated rejections cheaper.
export const TRAFFIC = {
  globalMinute: 300,
  globalDay: 12000,
  globalMonth: 250000,
  uploadMonth: 50000000,
};
export function policiesFor({ owner, ip, group, bytes = 0, now = Date.now() }) {
  const rule = (bucket, limit, seconds, cost = 1) => ({ bucket, limit, seconds, cost });
  const month = new Date(now);
  const monthStart = Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1) / 1000;
  const monthEnd = Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1) / 1000;
  const monthly = (bucket, limit, cost = 1) => ({
    bucket,
    limit,
    cost,
    start: monthStart,
    end: monthEnd,
  });
  const limits = [
    rule('global:minute', TRAFFIC.globalMinute, 60),
    rule('global:day', TRAFFIC.globalDay, 86400),
    monthly('global:month', TRAFFIC.globalMonth),
    rule(`ip:${ip}:minute`, 120, 60),
    rule(`ip:${ip}:day`, 3000, 86400),
  ];
  if (group === 'session')
    limits.push(rule('global:sessions', 300, 86400), rule(`ip:${ip}:sessions`, 20, 3600));
  else {
    const [minute, day] = { drive: [45, 900], connect: [6, 50], write: [6, 100], read: [30, 400] }[
      group
    ];
    limits.push(
      rule(`owner:${owner}:${group}:minute`, minute, 60),
      rule(`owner:${owner}:${group}:day`, day, 86400),
    );
    if (group === 'drive')
      limits.push(rule('global:drive-burst', 12, 10), rule(`owner:${owner}:drive-burst`, 1, 1));
    if (bytes)
      limits.push(
        monthly('global:upload-month', TRAFFIC.uploadMonth, bytes),
        rule(`owner:${owner}:upload-day`, 10000000, 86400, bytes),
      );
  }
  return limits.map((p) => {
    const start = p.start ?? Math.floor(now / 1000 / p.seconds) * p.seconds;
    return {
      bucket: p.bucket,
      limit: p.limit,
      cost: p.cost,
      start,
      end: p.end ?? start + p.seconds,
    };
  });
}

export function rejectionCache(max = 2000) {
  const entries = new Map();
  return {
    get(policies, now = Date.now()) {
      for (const p of policies) {
        const expiry = entries.get(p.bucket);
        if (expiry > now) return Math.max(1, Math.ceil((expiry - now) / 1000));
        if (expiry) entries.delete(p.bucket);
      }
      return 0;
    },
    set(blocked, now = Date.now()) {
      for (const p of blocked) {
        if (entries.size >= max) entries.delete(entries.keys().next().value);
        entries.set(p.bucket, Math.min(p.end * 1000, now + 60000));
      }
    },
  };
}
