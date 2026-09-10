import { handleApi } from './api.mjs';
import { createSupabaseProvider } from './supabase-provider.mjs';
import { createSupabaseProjectsProvider } from './supabase-projects.mjs';
import { applyRuntimePolicy } from './runtime-policy.mjs';
import { workerUploadPolicy } from './projects-api.mjs';
import { createAiProvider } from './ai-provider.mjs';

/** Cloudflare entry: account APIs are server-only; the published UI stays static. */
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const provider = createSupabaseProvider(env);
      return handleApi(request, provider, {
        clientIp: request.headers.get('CF-Connecting-IP') || 'unknown',
        projectsProvider: createSupabaseProjectsProvider(env),
        projectUploadPolicy: workerUploadPolicy(env),
        aiProvider: createAiProvider(env,{getPrompt:(task,options)=>provider.getAiPrompt(task,options)}),
      });
    }
    const response = await env.ASSETS.fetch(request);
    return applyRuntimePolicy(request, response);
  },
};
