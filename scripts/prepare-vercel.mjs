// Production already has the database credential; keep it out of developer machines and build output.
if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
  if (process.env.DATABASE_URL) {
    await import('./migrate-postgres.mjs');
  } else {
    console.log('Demo build: configure DATABASE_URL to enable the cloud archive.');
  }
}
