# Browser Log Collection

Send logs to Flashcat from web browser pages with the browser logs SDK.


## Usage

After adding [`@datadog/browser-logs`][2] to your `package.json` file, initialize it with:

```javascript
import { flashcatLogs } from '@flashcatcloud/browser-logs'

flashcatLogs.init({
  clientToken: '<FC_CLIENT_TOKEN>',
  site: '<FC_SITE>',
  forwardErrorsToLogs: true,
  sessionSampleRate: 100,
})
```

After the Flashcat browser logs SDK is initialized, send custom log entries directly to Flashcat:

```javascript
import { flashcatLogs } from '@flashcatcloud/browser-logs'

flashcatLogs.logger.info('Button clicked', { name: 'buttonName', id: 123 })

try {
  ...
  throw new Error('Wrong behavior')
  ...
} catch (ex) {
  flashcatLogs.logger.error('Error occurred', { team: 'myTeam' }, ex)
}
```

<!-- Note: all URLs should be absolute -->

[2]: https://www.npmjs.com/package/@flashcatcloud/browser-logs
