import test from 'node:test';
import assert from 'node:assert/strict';
import { publicShowcaseAccess } from '../server/public-showcase-access.js';
import { normalizeVercelRequest } from '../server/vercel.js';

test('public deployment rejects legacy reads, admin login and inference before handling credentials or bodies', () => {
  for (const path of [
    'admin',
    'decide',
    'models',
    'status',
    'races',
    'races/example',
    'community',
    'unknown',
  ]) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
      for (const url of [
        `https://jevf1.vercel.app/api/${path}`,
        `https://jevf1.vercel.app/api?__path=${path}`,
      ]) {
        const request = new Request(url, {
          method,
          headers: { cookie: '__Host-jevrace-admin=anything', authorization: 'Bearer anything' },
        });
        assert.equal(publicShowcaseAccess(normalizeVercelRequest(request)).status, 404);
      }
    }
  }
});
test('only the exact maintenance GET reaches the existing cron authentication', () => {
  assert.equal(publicShowcaseAccess(new Request('https://jevf1.vercel.app/api/maintenance')), null);
  for (const path of ['/api/maintenance/', '/api/maintenance/extra']) {
    assert.equal(publicShowcaseAccess(new Request(`https://jevf1.vercel.app${path}`)).status, 404);
  }
  assert.equal(
    publicShowcaseAccess(
      new Request('https://jevf1.vercel.app/api/maintenance', { method: 'POST' }),
    ).status,
    404,
  );
});
