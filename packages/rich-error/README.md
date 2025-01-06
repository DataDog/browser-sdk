# RUM Browser Monitoring - RichError

TBD Description

## Installation

```bash
npm install @datadog/browser-rum @datadog/browser-rich-error
```

## Usage

### Initialization

To enable the React integration, pass the `reactPlugin` to the `plugins` option of the `datadogRum.init` method:

```javascript
import { datadogRum } from '@datadog/browser-rum'
import { richErrorPlugin } from '@datadog/browser-rich-error'

datadogRum.init({
  applicationId: ...,
  clientToken: ...,
  ...
  plugins: [richErrorPlugin()],
})
```

### Usage


```ts
throw new RichError('ValidationError', 'email is invalid', { email });
```
