# RUM Browser Monitoring

Datadog Real User Monitoring (RUM) enables you to visualize and analyze the real-time performance and user journeys of your application's individual users.

See the [dedicated datadog documentation][1] for more details.

## Usage

To start collecting events, add [`@datadog/browser-rum`][2] to your `package.json` file, then initialize it with:

```javascript
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  applicationId: '<DATADOG_APPLICATION_ID>',
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
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

[1]: https://docs.datadoghq.com/real_user_monitoring/browser
[2]: https://www.npmjs.com/package/@datadog/browser-rum
