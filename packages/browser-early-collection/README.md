# Early Collection Browser SDK package

A tiny, zero-dependency script to include as the very first script of a page. It starts
collecting the data that is otherwise lost before the Datadog Browser SDK bundle is loaded and
evaluated:

- uncaught errors and unhandled rejections, kept as raw data (the original `Error` objects and
  messages: no stack parsing, no formatting), and
- a JS Self-Profiling API Profiler session (Chrome/Edge, requires the `Document-Policy:
js-profiling` response header; fails silently otherwise).

Evaluating the script starts the collection: no configuration, no API, no network request. The
collected data is handed over to the Browser SDK when it starts, then sealed.

See `src/index.ts` for the `window._DD_EARLY_COLLECTION` global published by the
script.
