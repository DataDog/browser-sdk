# Browser Support

| Feature           | Chrome | Firefox | Safari | Edge | Chrome Android | Safari iOS | IE11  | < IE11 | Opera |
| ----------------- | ------ | ------- | ------ | ---- | -------------- | ---------- | ----- | ------ | ----- |
| loading           | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| init              | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| rum request       | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| flush on hide     | ✅     | ✅      | ✅     | ✅   | ✅             | ❌         | ❌    | ❌     | ✅    |
| console error     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| network error     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| runtime error     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| auto action       | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| custom action     | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| long task         | ✅     | ❌      | ❌     | ✅   | ✅             | ❌         | ❌    | ❌     | ✅    |
| tracing           | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| route change      | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| loading time      | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| resource timing   | ✅     | ✅      | ⚠️(2)  | ✅   | ✅             | ⚠️(2)      | ⚠️(3) | ❌     | ✅    |
| navigation timing | ✅     | ✅      | ✅     | ✅   | ✅             | ✅         | ✅    | ❌     | ✅    |
| web vitals        | ✅     | ⚠️(1)   | ⚠️(1)  | ✅   | ✅             | ⚠️(1)      | ❌    | ❌     | ✅    |
| FCP               | ✅     | ❌      | ❌     | ✅   | ✅             | ❌         | ❌    | ❌     | ✅    |

1. FID only
2. size information not available
3. firstByte and download only
