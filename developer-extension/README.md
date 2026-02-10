# Browser SDK developer extension

Browser extension to investigate your Browser SDK integration.

## Installation

The extension is available on the [Chrome Web Store](https://chrome.google.com/webstore/detail/datadog-browser-sdk-devel/boceobohkgenpcpogecpjlnmnfbdigda).

## Features

- Log events sent by the SDK in the devtools console
- Flush buffered events
- End current session
- Load the SDK development bundles instead of production ones
- Switch between `rum` and `rum-slim` bundles
- Retrieve Logs/RUM configuration

## Browser compatibility

For now, only Google Chrome is supported.

## Usage tips

### Event Tab

The Event Tab contains a list of events sent by the SDK and a menu of event types for quick filtering.

#### Search syntax

We support a basic `key:value` search syntax, which means you can search within the limits of [RUM event structures](https://docs.datadoghq.com/real_user_monitoring/explorer/search/), such as `action.target.name:action_name`.

We split each search key based on whitespace. To search with multiple conditions, simply add whitespace characters in between, such as:

```
type:view application.id:2 action.target.name:my_action_name
```

#### Event columns

The Events List offers an interactive experience to visualize RUM events:

- Drag and drop to reorder columns in the event list
- Remove (by clicking on `x` in the column title) or add new columns:
  - Add a new column from searching for a field by clicking on the `+column` icon at the right side of the header row.
  - Add a new column from values in existing columns by right clicking on any attribute in the event json.
- Copy queries and objects from the list by clicking on any cell

### Info Tab

**⚠️Don’t forget to reset everything in the Info Tab after experimenting.**

Info tab contains information about Session and RUM SDK configurations

- **RUM/LOGS Configuration**: edit configuration files on the fly. When configuration changes apply, the extension will automatically reload the page. But for some configurations you might want to click on End Current Session to ensure that the changes kicked in.
- **End current session**: manually end the current session within the extension. This will also end the current replay session.

### Setting Tab

> [!IMPORTANT]
> Don’t forget to reset everything in the Setting Tab after experimenting.

- **Request Interception**: override the current SDK bundle with local build, or ​​switch between `rum` and `rum-slim` bundles on any site that is using RUM SDK. (note: if the SDK is installed from NPM, this override might not work, as it is still in an experimental stage.)

- **Debug Mode**: This option enables debug mode from the developer extension to display errors happening in RUM and LOGS in the developer console.

## Contribution

To get up to speed with WebExtensions for devtools, read the [Extend the developer tools](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Extending_the_developer_tools) MDN guide. Pay special attention to the various entrypoints (`panel.html`, `devtools.html`) and the content script communication, as it's not straightforward.

### Development setup

From the `developer-extension` folder, run `yarn build` then `yarn dev`. 

There are two ways to work with the extension:

#### Option A: Use the auto-launched browser (recommended)

A Chrome window opens automatically with the extension loaded, DevTools open, and the [Browser SDK test playground](https://datadoghq.dev/browser-sdk-test-playground/) ready to use.

#### Option B: Load the extension into your own Chrome profile

1. In Chrome, navigate to [chrome://extensions](chrome://extensions) and enable _Developer Mode_.
2. Click _Load unpacked_ and select the `dist/chrome-mv3/` folder.
3. Open DevTools — the extension is available in the **Browser SDK** panel.

> **Tip:** You can also load the `dist/chrome-mv3-dev/` folder for a development build with hot reload.

After making a change, right-click the extension UI and select **Reload frame** to see your updates.
