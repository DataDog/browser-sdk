# Datadog RUM Firefox Extension - Debug Version with iFrame

This extension demonstrates using Datadog RUM in a Firefox browser extension with manifest v2 and a background worker script. This version includes an iframe for error stack comparison.

## Features

- Uses manifest v2 which is supported by Firefox
- Initializes Datadog RUM in a persistent background script
- Includes an iframe with a test form for comparison of error stacks
- Logs and compares error stacks between background script and iframe
- Includes a debug page to monitor extension status and test functionality

## Building the Extension

1. Install dependencies:
```
npm install
```

2. Build the extension:
```
npm run build
```

3. Run in Firefox with debugging enabled:
```
npm run start:firefox
```

4. Build Firefox package (optional):
```
npm run build:firefox
```

## Loading in Firefox Manually

### Temporary Installation (for testing)

1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on..."
5. Navigate to the `testing-extensions` directory and select the `manifest.json` file

## Debugging

- Use the debug page accessible via the extension popup
- Test the iframe form to compare error stacks between contexts
- Use the Firefox Browser Toolbox to debug the extension (open via `Tools > Web Developer > Browser Toolbox`)
- Background script logs will appear in the Browser Console
- For persistent debugging, use: `npm run start:firefox`

## Error Stack Comparison

This extension helps debug RUM initialization in Firefox by comparing error stacks from:
- Background script (persistent background worker)
- iFrame context (embedded in the debug page)

The comparison helps identify how Firefox handles different extension contexts and can help troubleshoot RUM initialization issues.

## Troubleshooting

If RUM is not initializing properly in the background script:

1. Check the Firefox Browser Console for errors
2. Compare error stacks between background and iframe contexts
3. Verify that the extension has the proper permissions
4. Use the debug page to check extension status and logs
5. Make sure Firefox is not blocking any connections

## Architecture

This debug version contains:

- `background.js`: Initializes RUM and runs persistently
- `debug.html`: Page to check extension status and RUM initialization
- `iframe-form.html`: Test form in an iframe for error stack testing
- `popup.html`: Simple popup with link to the debug page
- `manifest.json`: Extension configuration for Firefox compatibility 