import { defineNuxtPlugin, useRoute } from 'nuxt/app'

export default defineNuxtPlugin(() => {
  const route = useRoute()
  if (route.path === '/startup-error') {
    throw new Error('Nuxt startup error from app:error')
  }
})
