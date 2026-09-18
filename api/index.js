import { neon } from '@neondatabase/serverless';
import { postgresArchive } from '../server/postgres-archive.js';
import { createVercelHandler } from '../server/vercel.js';

export default {
  async fetch(request) {
    // Construct lazily: an unset environment should return 503, not crash module startup.
    let store;
    if (process.env.DATABASE_URL) {
      try {
        const sql = neon(process.env.DATABASE_URL, {
          fetchOptions: { signal: AbortSignal.timeout(10000) },
        });
        store = postgresArchive((text, params) => sql.query(text, params));
      } catch {
        /* The handler reports an incomplete setup without exposing the database URL. */
      }
    }
    return createVercelHandler({ env: process.env, store })(request);
  },
};
