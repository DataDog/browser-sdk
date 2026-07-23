# Salesforce Integration

## Overview

Instrument Salesforce Lightning Apps and Experience Cloud sites with Datadog Real User Monitoring using the Datadog RUM Salesforce bundle.

This guide covers three deployment paths, plus a feature support reference:

- **[Lightning Apps](#lightning-apps)**: Use a custom Lightning Web Component loaded from the Utility Bar.
- **[Experience Cloud Head Markup](#experience-cloud-head-markup)**: Add the Datadog RUM initialization script directly to Head Markup.
- **[Experience Cloud Theme/Layout LWC](#experience-cloud-themelayout-lwc)**: Add a custom Lightning Web Component to an Experience Builder page, shared region, or theme/layout area.
- **[Feature Support](#salesforce-feature-support-matrix)**: Review supported features for the Datadog integration.

**Note**: Use only one deployment path per Salesforce app or Experience Cloud site.

## Setup

You will need the following Datadog RUM values:

- A Datadog RUM Application ID
- A Datadog RUM Client Token
- A Datadog site, such as `datadoghq.com`

You can get those values in Datadog under **Digital Experience > Real User Monitoring > Manage Applications > Set Up Manually**.

You should also enable [Lightning Web Security][1] in the Salesforce org.

Finally, you need the [Datadog RUM Salesforce Bundle][2]. Download it into your Salesforce project's static resources folder, for example:

```shell
curl -o staticresources/datadog_rum.js https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum-salesforce.js
```

Once you have these, follow one of the deployment paths below:

- **[Lightning Apps](#lightning-apps)**: Use a custom Lightning Web Component loaded from the Utility Bar.
- **[Experience Cloud Head Markup](#experience-cloud-head-markup)**: Add the Datadog RUM initialization script directly to Head Markup.
- **[Experience Cloud Theme/Layout LWC](#experience-cloud-themelayout-lwc)**: Add a custom Lightning Web Component to an Experience Builder page, shared region, or theme/layout area.

## Lightning Apps

Use this path for Salesforce LWC applications.

This path uses:

- A Salesforce Static Resource for the Datadog Salesforce RUM bundle.
- A CSP Trusted Site for the Datadog browser intake endpoint.
- A custom Lightning Web Component.
- A Utility Bar configuration with eager loading enabled.

### 1. Add the static resource

Copy the Datadog Salesforce RUM bundle into your Salesforce project and register it as a static resource.

Suggested configuration:

- Static Resource Name: `datadog_rum`
- File location: `staticresources/datadog_rum.js`
- Metadata location: `staticresources/datadog_rum.resource-meta.xml`

XML configuration:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
  <cacheControl>Public</cacheControl>
  <contentType>application/javascript</contentType>
</StaticResource>
```

If you configure this through the Salesforce UI:

1. Go to **Setup > Static Resources**.
2. Click **New**.
3. Set **Name** to `datadog_rum`.
4. Upload the Salesforce RUM JavaScript bundle.
5. Set **Cache Control** to `Public`.
6. Save the static resource.

### 2. Add the CSP Trusted Site

Allow Salesforce's Content Security Policy to connect to the Datadog browser intake endpoint. Without this configuration, the browser may block RUM events from being sent to Datadog.

Suggested configuration:

- File location: `cspTrustedSites/browser_intake_datadoghq_com.cspTrustedSite-meta.xml`

XML configuration:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<CspTrustedSite xmlns="http://soap.sforce.com/2006/04/metadata">
  <context>All</context>
  <description>Datadog browser RUM intake for US1</description>
  <endpointUrl>https://browser-intake-datadoghq.com</endpointUrl>
  <isActive>true</isActive>
  <isApplicableToConnectSrc>true</isApplicableToConnectSrc>
</CspTrustedSite>
```

For non-US1 Datadog sites, update `endpointUrl` to match the correct Datadog browser intake endpoint for your region.

### 3. Create the Datadog init component

Create a Lightning Web Component that loads the Datadog Browser SDK and manually starts views as users navigate within the Lightning application.

A Lightning Web Component bundle requires an HTML template. Create the following file first.

File location: `lwc/datadogInit/datadogInit.html`

```html
<template></template>
```

### 4. Add the component JavaScript

File location: `lwc/datadogInit/datadogInit.js`

```javascript
import { LightningElement, api, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRum from '@salesforce/resourceUrl/datadog_rum'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId
  @api clientToken
  @api site
  @api service
  @api env

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
    return loadScript(this, datadogRum).then(() => {
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

### 5. Add to Utility Bar

Expose the component to the Lightning Utility Bar, then add it to your app's Utility Bar with `eager` set to `true`.

`lwc/datadogInit/datadogInit.js-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>64.0</apiVersion>
  <isExposed>true</isExposed>
  <masterLabel>Datadog Init</masterLabel>
  <targets>
    <target>lightning__UtilityBar</target>
  </targets>
  <targetConfigs>
    <targetConfig targets="lightning__UtilityBar">
      <property name="applicationId" type="String" label="Application ID" required="true" />
      <property name="clientToken" type="String" label="Client Token" required="true" />
      <property name="site" type="String" label="Site" />
      <property name="service" type="String" label="Service" />
      <property name="env" type="String" label="Env" />
    </targetConfig>
  </targetConfigs>
</LightningComponentBundle>
```

Add the following `componentInstance` excerpt to your app's existing Utility Bar FlexiPage metadata, for example in `flexipages/MyApp_UtilityBar.flexipage-meta.xml`.

```xml
<componentInstance>
  <componentInstanceProperties>
    <name>eager</name>
    <type>decorator</type>
    <value>true</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>applicationId</name>
    <type>String</type>
    <value>YOUR_DATADOG_APPLICATION_ID</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>clientToken</name>
    <type>String</type>
    <value>YOUR_DATADOG_CLIENT_TOKEN</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>site</name>
    <type>String</type>
    <value>YOUR_DATADOG_SITE</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>service</name>
    <type>String</type>
    <value>YOUR_SERVICE_NAME</value>
  </componentInstanceProperties>
  <componentInstanceProperties>
    <name>env</name>
    <type>String</type>
    <value>YOUR_ENV_NAME</value>
  </componentInstanceProperties>
  <componentName>datadogInit</componentName>
  <identifier>datadogInit</identifier>
</componentInstance>
```

### 6. Validate the Lightning app installation

After deploying the component:

1. Open the Lightning app.
2. Open browser developer tools.
3. Confirm that the Datadog static resource loads successfully.
4. Confirm there are no CSP errors for the Datadog browser intake endpoint.
5. Navigate between Lightning pages.
6. In Datadog RUM Explorer, filter by the configured service and env.
7. Confirm that view events are created when navigation occurs.

## Experience Cloud Head Markup

Use this path for Experience Cloud sites where you can add custom JavaScript through Head Markup. This is usually the most direct Experience Cloud approach because the SDK loads at the page level and does not rely on the Salesforce Utility Bar.

This path uses:

- A Salesforce Static Resource for the Datadog Salesforce RUM bundle.
- Experience Cloud CSP configuration.
- A Head Markup script that loads the SDK and tracks route changes.

### 1. Add the static resource

Copy the Datadog Salesforce RUM bundle into your Salesforce project and register it as a static resource.

Suggested configuration:

- Static Resource Name: `datadog_rum`
- File location: `staticresources/datadog_rum.js`
- Metadata location: `staticresources/datadog_rum.resource-meta.xml`

XML configuration:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
  <cacheControl>Public</cacheControl>
  <contentType>application/javascript</contentType>
</StaticResource>
```

If you configure this through the Salesforce UI:

1. Go to **Setup > Static Resources**.
2. Click **New**.
3. Set **Name** to `datadog_rum`.
4. Upload the Salesforce RUM JavaScript bundle.
5. Set **Cache Control** to `Public`.
6. Save the static resource.

### 2. Open the Experience Cloud site in Builder

1. Go to **Setup > Apps > App Manager**.
2. Search for your Experience Cloud application.
3. Click **Manage**.
4. When the page loads, click **Builder**.

### 3. Configure CSP for the Datadog intake endpoint

In Experience Builder:

1. Go to **Settings > Security & Privacy**.
2. Change the security level from **Strict CSP** to **Relaxed CSP**.
3. Add the Datadog browser intake endpoint as a trusted site.

Use the following trusted site configuration for US1:

| Field | Value                                  |
| ----- | -------------------------------------- |
| Name  | `browser_intake_datadoghq_com`         |
| URL   | `https://browser-intake-datadoghq.com` |

For non-US1 Datadog sites, use the intake endpoint for the correct [Datadog site][4].

### 4. Add the Head Markup

In Experience Builder:

1. Go to **Settings > Advanced**.
2. Open **Head Markup**.
3. Click **Edit Head Markup**.
4. Paste the following markup.
5. Replace the placeholder values with your Datadog RUM configuration.

```html
<x-oasis-script hidden>
  ;(function () {
    var datadogScript = document.createElement('script')
    datadogScript.src = '/sfsites/c/resource/datadog_rum'
    datadogScript.onload = function () {
      window.DD_RUM.onReady(function () {
        window.DD_RUM.init({
          applicationId: '<YOUR_DATADOG_APPLICATION_ID>',
          clientToken: '<YOUR_DATADOG_CLIENT_TOKEN>',
          site: '<YOUR_DATADOG_SITE>',
          env: '<YOUR_ENV_NAME>',
          service: '<YOUR_SERVICE_NAME>',
          sessionSampleRate: 100,
          trackLongTasks: true,
          trackResources: true,
          trackUserInteractions: true,
        })
      })
    }
    document.head.appendChild(datadogScript)
  })()
</x-oasis-script>
```

### 5. Publish the Experience Cloud site

After adding the Head Markup script:

1. Save the Head Markup configuration.
2. Publish the Experience Cloud site.
3. Open the published site in a new browser session.
4. Confirm that the Datadog static resource loads.
5. Confirm that no CSP errors appear in the browser console.
6. Navigate between site pages.
7. Confirm that RUM view events appear in Datadog.

## Experience Cloud Theme/Layout LWC

Use this path when you want to instrument an Experience Cloud site with a Lightning Web Component instead of Head Markup.

This path is useful when:

- Head Markup is unavailable.
- You want to place the initializer in a shared region, template, page layout, or theme/layout area.
- You want to reuse the LWC-based implementation pattern across Salesforce surfaces.

Unlike Lightning Apps, Experience Cloud does not use the Utility Bar. The `datadogInit` component must be placed somewhere that loads on every page where RUM should run:

- For lightweight installations, expose the component as an Experience Builder page component and place it in a shared region that appears across the site.
- For custom LWR theme layouts, include the initializer inside your existing custom theme layout wrapper.

This path uses:

- A Salesforce Static Resource for the Datadog Salesforce RUM bundle.
- Experience Cloud CSP configuration.
- A custom Lightning Web Component exposed to Experience Builder.
- Placement in a shared site region, page template, or theme/layout area.

### 1. Add the static resource

Copy the Datadog Salesforce RUM bundle into your Salesforce project and register it as a static resource.

Suggested configuration:

- Static Resource Name: `datadog_rum`
- File location: `staticresources/datadog_rum.js`
- Metadata location: `staticresources/datadog_rum.resource-meta.xml`

XML configuration:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
  <cacheControl>Public</cacheControl>
  <contentType>application/javascript</contentType>
</StaticResource>
```

If you configure this through the Salesforce UI:

1. Go to **Setup > Static Resources**.
2. Click **New**.
3. Set **Name** to `datadog_rum`.
4. Upload the Salesforce RUM JavaScript bundle.
5. Set **Cache Control** to `Public`.
6. Save the static resource.

### 2. Configure CSP for the Datadog intake endpoint

In Experience Builder:

1. Go to **Settings > Security & Privacy**.
2. Change the security level from **Strict CSP** to **Relaxed CSP**.
3. Add the Datadog browser intake endpoint as a trusted site.

Use the following trusted site configuration for US1:

| Field | Value                                  |
| ----- | -------------------------------------- |
| Name  | `browser_intake_datadoghq_com`         |
| URL   | `https://browser-intake-datadoghq.com` |

For non-US1 Datadog sites, use the intake endpoint for the correct [Datadog site][4].

### 3. Create the Datadog init component

Create an LWC that loads the Datadog Browser SDK and manually starts views as users navigate within the Experience Cloud site.

A Lightning Web Component bundle requires an HTML template.

File location: `lwc/datadogInit/datadogInit.html`

```html
<template></template>
```

### 4. Add the component JavaScript

File location: `lwc/datadogInit/datadogInit.js`

```javascript
import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRum from '@salesforce/resourceUrl/datadog_rum'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
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
    return loadScript(this, datadogRum).then(() => {
      const initConfig = {
        applicationId: '<YOUR_DATADOG_APPLICATION_ID>',
        clientToken: '<YOUR_DATADOG_CLIENT_TOKEN>',
        env: '<YOUR_ENV_NAME>',
        service: '<YOUR_SERVICE_NAME>',
        site: '<YOUR_DATADOG_SITE>',
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

### 5. Add to Experience Builder

Expose the component to Experience Builder and place it in a shared region, page template, global header, global footer, or theme/layout area that loads on every page.

`lwc/datadogInit/datadogInit.js-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>64.0</apiVersion>
  <isExposed>true</isExposed>
  <masterLabel>Datadog Init</masterLabel>
  <targets>
    <target>lightningCommunity__Page</target>
    <target>lightningCommunity__Default</target>
  </targets>
</LightningComponentBundle>
```

### 6. Validate the Theme/Layout LWC installation

After publishing the site:

1. Open the Experience Cloud site in a new browser session.
2. Open browser developer tools.
3. Confirm that the Datadog static resource loads successfully.
4. Confirm there are no CSP errors for the Datadog browser intake endpoint.
5. Navigate between site pages.
6. Confirm that RUM view events appear in Datadog.

If the component is accidentally added multiple times, the global initialization guard prevents duplicate SDK initialization, but the component should still be placed only once for clarity and maintainability.

## Salesforce Feature Support Matrix

The following table outlines SDK feature support within the Lightning Web Security (LWS) sandbox environment.

| Feature Area        | Supported   | Notes                                                                     |
| ------------------- | ----------- | ------------------------------------------------------------------------- |
| **View Events**     |             |                                                                           |
| Initial View        | Yes         | Automatic on init.                                                        |
| Manual Tracking     | Yes         | Supported through `startView`.                                            |
| Navigation Timings  | Yes         | Collected via performance API.                                            |
| Web Vitals          | Yes         |                                                                           |
| **Resource Events** |             |                                                                           |
| Fetch / XHR         | Limited (2) | Context payload inaccessible.                                             |
| Other Resources     | Yes         | CSS, images, etc.                                                         |
| APM Correlation     | Limited (2) | Requires header injection.                                                |
| **Action Events**   |             |                                                                           |
| Custom Actions      | Yes         | Supported through `addAction`. (5) Not supported on the Head Markup path. |
| Click Actions       | Yes         | (3) Shadow DOM boundaries apply.                                          |
| Frustration Signals | Yes         |                                                                           |
| Loading Time        | Limited (1) | Network detection may be incomplete.                                      |
| **Error Events**    |             |                                                                           |
| Console / Custom    | Yes         | Captured via instrumentation. (5) Not supported on the Head Markup path.  |
| Runtime Errors      | Limited (4) | Often redacted as "Script error."                                         |
| Unhandled Rejection | No          | Event not supported in LWS.                                               |
| **Other**           |             |                                                                           |
| Vital Events        | Yes         |                                                                           |
| Long Task Events    | Yes         |                                                                           |
| Session Replay      | No          | DOM/Worker constraints prevent support.                                   |

Footnotes:

1. **Loading Time**: Ends when no pending network requests are detected. LWS may hide some fetch/XHR activity.
2. **Limited Context**: Inaccessible sandbox objects mean `beforeSend` cannot access response bodies or full XHR objects.
3. **Selectors**: Due to shadow boundaries, `event.target` may reflect the component host rather than the inner element.
4. **Runtime Errors**: Errors passing through the Lightning shell may lose stack traces and original error objects.
5. **Head Markup limitation**: The Experience Cloud Head Markup path has no component context to call `addAction` or `addError`, so custom actions and custom error tracking are not supported there.

## Troubleshooting

Need help? Contact [Datadog Support][3].

[1]: https://help.salesforce.com/s/articleView?id=sf.lwc_lwsec_enable.htm
[2]: https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum-salesforce.js
[3]: https://docs.datadoghq.com/help/
[4]: https://docs.datadoghq.com/getting_started/site/#access-the-datadog-site
