import { createApp } from 'vue'
import { createWebHistory } from 'vue-router'
import { createRouter } from '@datadog/browser-rum-vue/vue-router-v4'
import { datadogRum } from '@datadog/browser-rum'
import { vuePlugin, addVueError } from '@datadog/browser-rum-vue'
import App from './App.vue'

declare global {
  interface Window {
    RUM_CONFIGURATION?: any
    RUM_CONTEXT?: any
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/HomePage.vue') },
    { path: '/user/:id', component: () => import('./pages/UserPage.vue') },
    { path: '/tracked', component: () => import('./pages/TrackedPage.vue') },
    { path: '/error', component: () => import('./pages/ErrorPage.vue') },
  ],
})

datadogRum.init({ ...window.RUM_CONFIGURATION, plugins: [vuePlugin({ router: true })] })

if (window.RUM_CONTEXT) {
  datadogRum.setGlobalContext(window.RUM_CONTEXT)
}

const app = createApp(App)
app.config.errorHandler = addVueError
app.use(router).mount('#app')
