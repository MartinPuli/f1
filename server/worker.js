import { api } from './api.js';
export default {async fetch(request,env){if(new URL(request.url).pathname.startsWith('/api/'))return api(request,env);return env.ASSETS.fetch(request);}};
