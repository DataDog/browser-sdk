# Browser Support

| Feature           | Chrome | Firefox | Safari | Edge | Chrome Android | Safari iOS | IE  | Opera |
| ----------------- | ------ | ------- | ------ | ---- | -------------- | ---------- | --- | ----- |
| loading           | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| init              | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| rum request       | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| flush on hide     | ✅     | ✅      | ✅     | ✅   | ✅             | ❌         | ❌  | ✅    |
| console error     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| runtime error     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| CSP violation     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| intervention      | ✅     | ❌      | ❌     | ✅   | ✅             | ❌         | ❌  | ✅    |
| auto action       | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| custom action     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| long task         | ✅     | ❌      | ❌     | ✅   | ✅             | ❌         | ❌  | ✅    |
| tracing           | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| route change      | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| loading time      | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| resource timing   | ✅     | ✅      | ⚠️(2)  | ✅   | ✅             | ⚠️(2)      | ❌  | ✅    |
| navigation timing | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |
| web vitals        | ✅     | ⚠️(1)   | ⚠️(1)  | ✅   | ✅             | ⚠️(1)      | ❌  | ✅    |
| FCP               | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ❌  | ✅    |

1. FID only
2. size information not available
3. firstByte and download only
