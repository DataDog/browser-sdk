# Browser SDK developer extension

Browser extension to investigate your Browser SDK integration.

## Getting started

The extension is not (yet?) published on addons store. You will need to clone this repository and
build the extension manually.

```
$ git clone https://github.com/DataDog/browser-sdk
$ cd browser-sdk
$ yarn
$ yarn build
```

Then, in Google Chrome:

- Open the _Extension Management_ page by navigating to [chrome://extensions](chrome://extensions).
- Enable _Developer Mode_ by clicking the toggle switch next to _Developer mode_.
- Click the _LOAD UNPACKED_ button and select the `browser-sdk/developer-extension/dist`
  directory.
- Open devtools and the extension features are located on the `Browser SDK` panel.

## Features

- Log events sent by the SDK in the devtools console
- Flush buffered events
- End current session
- Load the SDK development bundles instead of production ones
- Switch between `rum` and `rum-slim` bundles
- Retrieve Logs/RUM configuration

## Browser compatibility

For now, only Google Chrome is supported.
