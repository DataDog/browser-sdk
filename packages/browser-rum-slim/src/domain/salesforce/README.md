# Salesforce Lightning RUM

This entrypoint is intended for Salesforce Lightning and LWC applications using the `rum-salesforce-lightning.js`
bundle. The SDK forces the Salesforce-specific RUM settings required for this environment:

- `trackViewsManually: true`
- `profilingSampleRate: 0`
- `sessionReplaySampleRate: 0`

## Recommended LWC Setup

```js
import { LightningElement, api, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import rumSalesforceLightning from '@salesforce/resourceUrl/rum_salesforce_lightning'
import { loadScript } from 'lightning/platformResourceLoader'

export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId
  @api clientToken
  @api site
  @api service
  @api env

  connectedCallback() {
    this.loadDatadogRum()
  }

  @wire(CurrentPageReference)
  handleCurrentPageReference(pageReference) {
    if (!pageReference) {
      return
    }

    this.loadDatadogRum().then(() => {
      this.startPageReference(pageReference)
    })
  }

  startPageReference(pageReference) {
    window.DD_RUM?.startSalesforceView?.({
      pageReference,
      baseUrl: window.location.origin || window.location.href,
      generateUrl: (pageReferenceToGenerate) => this[NavigationMixin.GenerateUrl](pageReferenceToGenerate),
    })
  }

  loadDatadogRum() {
    return loadScript(this, rumSalesforceLightning).then(() => {
      window.DD_RUM.initSalesforce({
        applicationId: this.applicationId,
        clientToken: this.clientToken,
        site: this.site,
        service: this.service,
        env: this.env,
      })
    })
  }
}
```

## Salesforce Feature Support

| Feature                | Supported                      |
| ---------------------- | ------------------------------ |
| **View Events**        |                                |
| Initial View           | ✅                             |
| Manual Tracking        | ✅                             |
| Navigation Timings     | ✅                             |
| Web Vitals             | ✅                             |
| Automatic Tracking     | ✅⚠️ Supported with workaround |
| Loading Time           | ✅⚠️(1)                        |
| **Resource Events**    |                                |
| Fetch Resources        | ✅⚠️(2)                        |
| XHR Resources          | ✅⚠️(2)                        |
| Other Resources        | ✅                             |
| APM Correlation        | ✅⚠️(2)                        |
| **Action Events**      |                                |
| Custom Actions         | ✅                             |
| Click Actions          | ✅                             |
| Frustration Signals    | ✅                             |
| Selectors              | ✅⚠️(3)                        |
| Action Name            | ✅⚠️(2)                        |
| Loading Time           | ✅⚠️(1)                        |
| **Error Events**       |                                |
| Console Error          | ✅                             |
| Custom Errors          | ✅                             |
| Runtime Errors         | ✅⚠️(4)                        |
| `onUnhandledRejection` | ❌                             |
| CSP Violation          | ❌                             |
| **Other**              |                                |
| Vital Events           | ✅                             |
| Long Task Events       | ✅                             |
| Session Replay         | ❌                             |

1. Loading time depends on page activity detection, which may not work fully in Salesforce Lightning due to shadow DOM restrictions on page lifecycle signals.
2. Cross-origin restrictions in the Lightning shell may hide full request URLs; APM correlation headers and action names derived from URLs may be incomplete.
3. Due to shadow boundaries, the SDK might receive the component host as `event.target` instead of the actual clicked element.
4. Direct synchronous errors can reach the SDK through `window.onerror`, but in the Lightning shell they may be redacted as "Script error." with no original error object, URL, line, or stack available to the SDK.
