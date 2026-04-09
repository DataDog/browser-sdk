<script setup lang="ts">
const nuxtApp = useNuxtApp()

function triggerAppError() {
  void nuxtApp.callHook('app:error', new Error('Nuxt app:error hook error'))
}
</script>

<template>
  <div>
    <h1>App Error Page</h1>
    <button data-testid="trigger-app-error" @click="triggerAppError">Trigger App Error</button>
  </div>
</template>
