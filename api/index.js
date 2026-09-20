import { secureResponse } from '../server/security.js';
import { publicShowcaseAccess } from '../server/public-showcase-access.js';
import { normalizeVercelRequest } from '../server/vercel.js';
import { neon } from '@neondatabase/serverless';
import { postgresArchive } from '../server/postgres-archive.js';
import { createVercelHandler } from '../server/vercel.js';

let handler;
export default {
  async fetch(request) {
    request = normalizeVercelRequest(request);
    const access = publicShowcaseAccess(request);
    if (access) return secureResponse(access);
    if (!handler) {
      let store;
      if (process.env.DATABASE_URL) {
        try {
          const sql = neon(process.env.DATABASE_URL);
          // Give each query its own deadline; don't reuse an expired signal across warm requests.
          store = postgresArchive((text, params) =>
            sql.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(5000) } }),
          );
        } catch {
          /* Missing settings return a plain 503 from the handler. */
        }
      }
      handler = createVercelHandler({ env: process.env, store });
    }
    return handler(request);
  },
};
