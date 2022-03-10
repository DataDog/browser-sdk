# RUM Browser Monitoring - electron package

## Overview

This package is adding support for electron app in addition of the [RUM package](../rum/README.md)

## Setup

- install this package from the git tag `DataDog/browser-sdk.git#datadog-browser-rum-electron-v0.0.1-electron-poc-gitpkg`

- for the `renderer` (aka browser) side of the electron app, see the [RUM package](../rum/README.md) documentation.

- for the `main` side of the electron app, please follow these steps:
  - add to the `preload.js` file inside the `main` folder

```
require("@datadog/browser-rum-electron").registerEventBridge();
```

- inside your `main.ts`or in the file where the `app` is started, add after `app.whenReady()` the follow:

```
startElectronRum({
    // use the same configuration object as the browser side
    applicationId: "YOUR_APP_ID",
    clientToken: "YOU_APP_TOKEN",
    site: "yoursite.com"
    })
)
```

example:

```
  - app
    .whenReady()
    .then(() => startElectronRum({
        // use the same configuration object as the browser side
        applicationId: "YOUR_APP_ID",
        clientToken: "YOU_APP_TOKEN",
        site: "yoursite.com"
        })
    )
    .then(() => {
    createWindow();
    ...
    })
```
