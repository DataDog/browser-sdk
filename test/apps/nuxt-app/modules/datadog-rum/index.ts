import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  setup() {
    const { resolve } = createResolver(import.meta.url)
    addPlugin({
      src: resolve('./runtime/plugin'),
      mode: 'client',
    })
  },
})
