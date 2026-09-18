import { api } from './api.js';
import { secureResponse } from './security.js';
export default {
  async fetch(request, env) {
    const result = await (new URL(request.url).pathname.startsWith('/api/')
      ? api(request, env)
      : env.ASSETS.fetch(request));
    return secureResponse(result);
  },
};
