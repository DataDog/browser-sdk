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

const params = new URLSearchParams(window.location.search)
const rumConfig = params.get('rum-config')
const rumContext = params.get('rum-context')

const config = rumConfig ? JSON.parse(rumConfig) : window.RUM_CONFIGURATION
const context = rumContext ? JSON.parse(rumContext) : window.RUM_CONTEXT

datadogRum.init({ ...config, plugins: [vuePlugin({ router: true })] })

if (context) {
  datadogRum.setGlobalContext(context)
}

const app = createApp(App)
app.config.errorHandler = addVueError
app.use(router).mount('#app')
