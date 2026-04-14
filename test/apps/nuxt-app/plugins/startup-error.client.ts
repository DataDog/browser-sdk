import { defineNuxtPlugin, useRoute } from 'nuxt/app'

export default defineNuxtPlugin(() => {
  const route = useRoute()
  if (route.query['startup-error']) {
    throw new Error('Startup error triggered by plugin')
  }
})
