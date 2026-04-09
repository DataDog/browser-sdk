<script setup lang="ts">
function triggerError() {
  throw new Error('Nuxt error from vueApp.config.errorHandler')
}
</script>

<template>
  <div>
    <h1>Error Page</h1>
    <button data-testid="trigger-error" @click="triggerError">Trigger Error</button>
  </div>
</template>
