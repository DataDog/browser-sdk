import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../../../', import.meta.url)
for (const framework of ['next', 'nuxt', 'angular']) {
  const publicDirectory = new URL(`./${framework}/public/`, import.meta.url)
  await mkdir(publicDirectory, { recursive: true })
  await copyFile(
    new URL('packages/browser-rum/bundle/datadog-rum.js', root),
    new URL('prototype-sdk.js', publicDirectory)
  )
  await copyFile(new URL('./runtime.js', import.meta.url), new URL('prototype-runtime.js', publicDirectory))
  console.log(`Prepared ${framework}: ${fileURLToPath(publicDirectory)}`)
}
