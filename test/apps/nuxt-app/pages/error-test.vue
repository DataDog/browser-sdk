<script setup lang="ts">
import { ref } from 'vue'
const hasError = ref(false)
function triggerError() {
  hasError.value = true
  throw new Error('Nuxt error from vueApp.config.errorHandler')
}
</script>
<template>
  <div>
    <h1>Error Page</h1>
    <button data-testid="trigger-error" @click="triggerError">Trigger Error</button>
    <div v-if="hasError" data-testid="error-handled">Error occurred</div>
  </div>
</template>
