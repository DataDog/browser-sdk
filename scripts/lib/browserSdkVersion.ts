import packageJson from '../../package.json' with { type: 'json' }

// The npm package version, used to ensure all packages are consistently versioned.
// On main, this is the same as browserSdkVersion below.
export const releaseVersion = packageJson.version

// The version baked into built SDK artifacts and the developer extension. Usually the same as
// releaseVersion, but can differ on long-lived branches where we want canary builds to display
// a future major version without bumping package.json (which would cause merge conflicts with main).
export const browserSdkVersion = packageJson.version
