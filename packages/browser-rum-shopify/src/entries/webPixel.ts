import { register } from '@shopify/web-pixels-extension'
import { startRegisteredWebPixel } from '../boot/startRegisteredWebPixel'

// The extension imports this bundle at the top level; the SDK owns its only registration.
register(startRegisteredWebPixel)
