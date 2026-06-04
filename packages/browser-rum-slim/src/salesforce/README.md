# Salesforce Lightning RUM

This entrypoint is intended for Salesforce Lightning and LWC applications.

## Recommended LWC Setup

### 1. Add the static resource

Copy `packages/browser-rum-slim/bundle/datadog-rum-slim.js` into your Salesforce project as `staticresources/datadog_rum_slim.js`.

Create the accompanying metadata file `staticresources/datadog_rum_slim.resource-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
    <cacheControl>Public</cacheControl>
    <contentType>application/javascript</contentType>
</StaticResource>
```

### 2. Add the CSP trusted site

Create a CSP trusted site metadata file under `cspTrustedSites/`, for example `cspTrustedSites/browser_intake_datadoghq_com.cspTrustedSite-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CspTrustedSite xmlns="http://soap.sforce.com/2006/04/metadata">
    <canAccessCamera>false</canAccessCamera>
    <canAccessMicrophone>false</canAccessMicrophone>
    <context>All</context>
    <description>Datadog browser RUM intake for US1</description>
    <endpointUrl>https://browser-intake-datadoghq.com</endpointUrl>
    <isActive>true</isActive>
    <isApplicableToConnectSrc>true</isApplicableToConnectSrc>
    <isApplicableToFontSrc>false</isApplicableToFontSrc>
    <isApplicableToFrameSrc>false</isApplicableToFrameSrc>
    <isApplicableToImgSrc>false</isApplicableToImgSrc>
    <isApplicableToMediaSrc>false</isApplicableToMediaSrc>
    <isApplicableToStyleSrc>false</isApplicableToStyleSrc>
</CspTrustedSite>
```

### 3. Create the LWC component

Create a new LWC component under `lwc/datadogInit/`, for example `lwc/datadogInit/datadogInit.js`:

```js
import { LightningElement, api, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId
  @api clientToken
  @api site
  @api service
  @api env
  @api allowedTracingUrls
  @api trackViewsManually

  connectedCallback() {
    this.initialize()
  }

  @wire(CurrentPageReference)
  handleCurrentPageReference(pageReference) {
    if (!pageReference) {
      return
    }

    this.initialize()

    if (window.DD_RUM) {
      this.startViewForPageReference(pageReference)
    }
  }

  startViewForPageReference(pageReference) {
    const urlPromise = this[NavigationMixin.GenerateUrl](pageReference)
    urlPromise.then((url) => {
      if (url === lastStartedUrl) {
        return
      }
      lastStartedUrl = url
      const absoluteUrl = new URL(url, window.location.origin).href
      window.DD_RUM.startView({ name: url, url: absoluteUrl })
    })
  }

  initialize() {
    if (!datadogInitialization) {
      datadogInitialization = this.loadDatadogRum()
    }
  }

  loadDatadogRum() {
    return loadScript(this, datadogRumSlim).then(() => {
      const initConfig = {
        applicationId: this.applicationId,
        clientToken: this.clientToken,
        env: this.env,
        service: this.service,
        site: this.site,
        trackViewsManually: true,
        trackEarlyRequests: true,
        trackLongTasks: true,
        trackResources: true,
        trackUserInteractions: true,
      }
      window.DD_RUM.init(initConfig)
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
```

Also create the required component metadata file `lwc/datadogInit/datadogInit.js-meta.xml` to expose it to the utility bar:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>59.0</apiVersion>
    <isExposed>true</isExposed>
    <targets>
        <target>lightning__UtilityBar</target>
    </targets>
</LightningComponentBundle>
```

### 4. Add the component to a Lightning App

Add `datadogInit` to your app's utility bar via a flexipage metadata file. Set `eager` to `true` so the component initializes immediately on page load.

If your app already has a utility bar, edit its existing flexipage file under `flexipages/`. If it does not, create one — for example `flexipages/MyApp_UtilityBar.flexipage-meta.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>applicationId</name>
                    <value>YOUR_APPLICATION_ID</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>clientToken</name>
                    <value>YOUR_CLIENT_TOKEN</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>site</name>
                    <value>datadoghq.com</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>service</name>
                    <value>your-service-name</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>env</name>
                    <value>production</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>eager</name>
                    <type>decorator</type>
                    <value>true</value>
                </componentInstanceProperties>
                <componentName>datadogInit</componentName>
                <identifier>datadogInit</identifier>
            </componentInstance>
        </itemInstances>
        <name>utilityItems</name>
        <type>Region</type>
    </flexiPageRegions>
    <!-- ... rest of your flexipage definition ... -->
</FlexiPage>
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

1. Loading time ends when no pending network requests are detected. Under LWS the SDK may not observe all pending fetch/XHR requests, causing loading time to end prematurely or be absent.
2. Events are collected, but `beforeSend` context will not include the response payload (`context.response`, `context.xhr`, `context.responseBody`) as these objects are inaccessible within the LWS sandbox.
3. Due to shadow boundaries, the SDK might receive the component host as `event.target` instead of the actual clicked element.
4. Direct synchronous errors can reach the SDK through `window.onerror`, but in the Lightning shell they may be redacted as "Script error." with no original error object, URL, line, or stack available to the SDK.
