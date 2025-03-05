# Testing Extensions for Datadog RUM

This extension is designed to test the Datadog RUM SDK in a browser extension environment.

## Setup

1. Make sure you have Yarn installed
2. Run `yarn install` to install dependencies

## Development Workflow

### Using the Local SDK

To build the extension using the local SDK from the repository:

```bash
yarn build
```

This will bundle the extension with the local version of the RUM SDK from the packages/rum directory.

### Using the Dev Server

To use the SDK from the development server:

1. Start the dev server in the root of the project:
   ```bash
   cd ..
   yarn dev
   ```

2. In a separate terminal, build the extension in development mode:
   ```bash
   cd testing-extensions
   yarn build:dev
   ```

3. For automatic rebuilding when files change:
   ```bash
   yarn watch
   ```

## Development with Hot Reloading

This extension supports a watch mode that automatically rebuilds when changes are detected in the source files.

### Setup

1. Make sure you have all dependencies installed:
   ```
   yarn install
   ```

2. Build the packages and start the watch mode:
   ```
   yarn start
   ```

This will:
- Build the necessary packages from the monorepo
- Build the extension
- Start watching for changes in:
  - The packages source files (`../packages/**/src/**/*.ts` and `../packages/**/src/**/*.js`)
  - The extension source files (`./src/**/*.js` and `./src/**/*.html`)

When changes are detected, the extension will automatically rebuild.

### Available Scripts

- `yarn build`: Build the extension once
- `yarn build:packages`: Build only the necessary packages from the monorepo
- `yarn watch`: Watch for changes in both packages and extension source files and rebuild when changes are detected
- `yarn watch:esbuild`: Watch only the extension source files using esbuild's built-in watch mode (faster but doesn't rebuild packages)
- `yarn start`: Build the extension and start the full watch mode
- `yarn dev`: Build the packages and start esbuild's watch mode for the extension

### Testing the Watch Mode

To verify that the watch mode is working correctly, you can use the test script:

1. Start the watch mode in one terminal:
   ```
   yarn watch
   ```

2. In another terminal, run the test script:
   ```
   node test-watch.js
   ```

This script will make test changes to files in both the packages directory and the extension source directory, and then revert those changes. You should see the watcher detect the changes and rebuild the extension.

### Testing in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top-right corner)
3. Click "Load unpacked" and select the `testing-extensions` directory
4. After making changes to the source files, the extension will automatically rebuild
5. Click the refresh icon on the extension card in Chrome to reload the extension with the new build

### Troubleshooting

If you encounter any issues with the watch mode:

1. Make sure all dependencies are installed
2. Try stopping the watch mode (Ctrl+C) and restarting it
3. Check the console output for any error messages
4. If the extension is not rebuilding, try manually running `yarn build`
5. Verify that the watch patterns in `watch-sdk.js` match your project structure
6. Try using the `usePolling: true` option in the watcher configuration (already enabled in the latest version)
7. Run the test script to verify that the watcher is detecting file changes
8. If changes in the packages directory aren't being detected, try running `yarn build:packages` manually
9. Check if your editor is creating temporary files that might be confusing the watcher

If none of these solutions work, you can try the alternative approach:

1. In one terminal, run `yarn watch:esbuild` to watch only the extension source files
2. In another terminal, manually run `yarn build:packages` whenever you make changes to the packages

## Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top-right corner)
3. Click "Load unpacked" and select the `testing-extensions` directory
4. The extension should now be loaded and using the specified version of the RUM SDK

## Verifying the SDK Source

When the extension runs, it will log a message to the console indicating which version of the SDK it's using:

- `[Extension] Using local package RUM SDK version X.X.X` - Using the local SDK from the repository
- `[Extension] Using dev server RUM SDK version X.X.X` - Using the SDK from the dev server
- `[Extension] Using published RUM SDK version X.X.X` - Using the published SDK from npm

## Troubleshooting

If you encounter issues with the extension:

1. Check the browser console for error messages
2. Ensure the dev server is running if using development mode
3. Try rebuilding the extension with `yarn build` or `yarn build:dev`
4. Reload the extension in Chrome by clicking the refresh icon on the extension card 