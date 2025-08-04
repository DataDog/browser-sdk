# Browser Support

This document outlines browser support for the `@datadog/browser-worker-logs` package in **Service Worker contexts**.

## Service Worker Support Matrix

| Feature          | Chrome | Firefox | Safari | Edge | Chrome Android | Safari iOS | IE  | Opera |
| ---------------- | ------ | ------- | ------ | ---- | -------------- | ---------- | --- | ----- |
| loading          | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| init             | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| global context   | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| logs request     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| flush on hide    | ❌     | ❌      | ❌     | ❌   | ❌             | ❌         | ❌  | ❌    |
| console error    | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| network error    | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| runtime error    | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| CSP violation    | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| reports          | ✅     | ⚠️      | ⚠️     | ✅   | ✅             | ⚠️         | ❌  | ✅    |
| custom logger    | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| handler          | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| session tracking | ❌     | ❌      | ❌     | ❌   | ❌             | ❌         | ❌  | ❌    |
