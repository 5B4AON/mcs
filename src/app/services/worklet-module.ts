/**
 * Morse Code Studio
 */

/**
 * AudioWorklet processors are separate files that the browser fetches each time
 * audio starts. Fetching them once when the app loads and keeping their source
 * in memory means audio still starts when the server can no longer be reached
 * (a stopped dev server, a dropped connection before the service worker has
 * cached them). Pure helpers, no Angular.
 */
const sources = new Map<string, Promise<string | null>>();
const urls = new Map<string, string>();

/** Start fetching a processor file into memory (once; a failed fetch is retried next time) */
export function preloadWorkletModule(path: string): void {
  if (sources.has(path)) return;
  const p = fetch(path)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .catch(() => {
      sources.delete(path);
      return null;
    });
  sources.set(path, p);
}

/** The processor's source text, from memory when possible; null when it cannot be loaded */
export async function loadWorkletSource(path: string): Promise<string | null> {
  preloadWorkletModule(path);
  return (await sources.get(path)) ?? null;
}

/** Load a processor into a context, from memory when possible, otherwise from its file */
export async function addWorkletModule(ctx: BaseAudioContext, path: string): Promise<void> {
  let url = urls.get(path);
  if (!url) {
    const src = await loadWorkletSource(path);
    if (src) {
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      urls.set(path, url);
    }
  }
  if (url) {
    try {
      await ctx.audioWorklet.addModule(url);
      return;
    } catch { /* a browser that refuses Blob modules: use the file */ }
  }
  await ctx.audioWorklet.addModule(path);
}
