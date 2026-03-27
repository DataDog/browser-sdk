<script setup lang="ts">
import { ref } from 'vue'

const hasError = ref(false)

function triggerError() {
  hasError.value = true
  throw new Error('Error triggered by button click')
}
</script>

<template>
  <div>
    <h1>Error Page</h1>
    <button data-testid="trigger-error" @click="triggerError">Trigger Error</button>
    <div v-if="hasError" data-testid="error-boundary">Error occurred</div>
  </div>
</template>
