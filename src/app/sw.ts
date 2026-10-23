/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// Supabase REST reads: network first, cache fallback. Writes (POST rpc) are never cached.
const supabaseReads = {
  matcher: ({ url, request }: { url: URL; request: Request }) =>
    request.method === "GET" && url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/"),
  handler: new NetworkFirst({ cacheName: "weconnect-supabase-reads", networkTimeoutSeconds: 4 }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [supabaseReads, ...defaultCache],
  fallbacks: { entries: [] },
});

serwist.addEventListeners();
