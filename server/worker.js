import { api } from './api.js';
export default {async fetch(request,env){
 const result=await (new URL(request.url).pathname.startsWith('/api/')?api(request,env):env.ASSETS.fetch(request));
 const response=new Response(result.body,result);
 response.headers.set('X-Content-Type-Options','nosniff');
 response.headers.set('Referrer-Policy','no-referrer');
 response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");
 return response;
}};
