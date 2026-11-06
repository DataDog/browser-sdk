# Early Collection Browser SDK package

A tiny, zero-dependency script to include as the very first script of a page. It starts a
JS Self-Profiling API Profiler session (Chrome/Edge, requires the `Document-Policy:
js-profiling` response header; fails silently otherwise) before the Datadog Browser SDK
bundle is loaded, so the first collected profile covers the whole page load.

Evaluating the script starts the session: no configuration, no API, no network request. The
Browser SDK takes over the Profiler instance when it starts.

See `src/index.ts` for the `window._DD_EARLY_COLLECTION` global published by the script.
