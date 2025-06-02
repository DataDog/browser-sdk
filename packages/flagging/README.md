# Flagging SDK (Prerelease)

This package supports flagging and experimentation by performing evaluation in the browser.

## Integrating the Unpublished Package

Since this package is not published to NPM, you'll need to follow these steps to integrate it into your project:

1. Build and pack the package:
   ```bash
   cd path/to/browser-sdk/packages/flagging
   yarn build
   yarn pack
   ```
   This will create a `.tgz` file in the current directory.

2. Move the `.tgz` file to your target project:
   ```bash
   mv datadog-browser-flagging-v*.tgz path/to/your/project/
   ```

3. In your target project, install the package and commit the file to your source control


### Automation Script

We provide a helper script `INTEGRATE-FLAGGING-PACKAGE.sh` that automates these steps assuming the target project uses `yarn`. Usage:

```bash
./INTEGRATE-FLAGGING-PACKAGE.sh /path/to/browser-sdk/packages/flagging /path/to/target/project
```

The script will build, pack, and integrate the package into your target project automatically.
