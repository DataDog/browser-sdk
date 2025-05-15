# RUM Browser Monitoring

Flashcat Real User Monitoring (RUM) enables you to visualize and analyze the real-time performance and user journeys of your application's individual users.

See the [dedicated flashcat documentation][1] for more details.

## Usage

To start collecting events, add [`@datadog/browser-rum`][2] to your `package.json` file, then initialize it with:

```javascript
import { datadogRum } from '@datadog/browser-rum'

flashcatRum.init({
  applicationId: '<FC_APPLICATION_ID>',
  clientToken: '<FC_CLIENT_TOKEN>',
  site: '<FC_SITE>',
  //  service: 'my-web-application',
  //  env: 'production',
  //  version: '1.0.0',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  trackResources: true,
  trackLongTasks: true,
  trackUserInteractions: true,
})
```

**Note**: The `trackUserInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained in your pages may be included to identify the elements interacted with.

<!-- Note: all URLs should be absolute -->

[1]: https://docs.flashcat.cloud/zh/flashduty/rum/introduction
[2]: https://www.npmjs.com/package/@flashcatcloud/browser-rum
