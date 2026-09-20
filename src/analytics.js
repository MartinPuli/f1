import { inject } from '@vercel/analytics';

// Only the public deployment records visits. Never include replay queries or hashes.
if (import.meta.env.PROD && location.hostname === 'jevf1.vercel.app') {
  inject({
    mode: 'production',
    beforeSend(event) {
      const url = new URL(event.url);
      url.search = '';
      url.hash = '';
      return { ...event, url: url.href };
    },
  });
}
