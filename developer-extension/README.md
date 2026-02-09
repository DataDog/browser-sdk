# Browser SDK developer extension

Browser extension to investigate your Browser SDK integration.

## Getting started

### From the Chrome Web Store

The extension is available to **Datadog employees** on the [Chrome Web Store](https://chrome.google.com/webstore/detail/datadog-browser-sdk-devel/boceobohkgenpcpogecpjlnmnfbdigda).

### By loading the extension unpacked

You will need to clone this repository and build the extension manually.

```
$ git clone https://github.com/DataDog/browser-sdk
$ cd browser-sdk
$ yarn
$ yarn build
```

There are two ways to use the extension:

#### Option A: Use the auto-launched browser (recommended for development)

1. cd into the `developer-extension` folder.
2. Run `yarn dev`.
3. A Chrome browser window with the developer extension loaded opens automatically.
4. After you make a change, right-click on the extension UI and select **"Reload frame"** to see your updates.

#### Option B: Load the unpacked extension manually

If you prefer to load the extension into your own Chrome profile:

1. Run `yarn build` from the `developer-extension` folder.
2. In Chrome, go to [chrome://extensions](chrome://extensions), enable **Developer Mode**, click **Load unpacked**.
3. Navigate to the `developer-extension` folder.
4. Press **⌘ + Shift + .** to reveal hidden files.
5. Open the `.output/chrome-mv3/` folder.
6. Open devtools — the extension features are located on the **Browser SDK** panel.

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

## Contribution tips

Read the [Extend the developers
tools](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Extending_the_developer_tools)
MDN guide to get up to speed with WebExtensions for devtools. In particular, look for the
various entrypoints (panel.html, devtools.html) and the content script communication, as it'
s not straightforward.

To work on the developer extension and debug it easily:

1. In a terminal, cd into the `developer-extension` folder.

2. Run `yarn dev`.

3. A Chrome browser window with the developer extension loaded opens.

> **Tip:** If you are running `yarn dev` and want to load the extension into your own Chrome profile, you can load the `.output/chrome-mv3-dev/` folder instead of `.output/chrome-mv3/`. This dev build includes hot reload support.
