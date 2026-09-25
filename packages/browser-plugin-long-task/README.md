# Long task plugin (spike, not for production use)

Feasibility spike: ports the built-in long-task collector behind the public `RumPlugin` contract,
as a separate package, to test whether core RUM features can be modularized the same way
`@datadog/browser-plugin-wasm` is. See the "Early investigation" doc for context.

## Setup

```js
import { longTaskPlugin } from '@datadog/browser-plugin-long-task'
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  // ...
  plugins: [longTaskPlugin()],
})
```
