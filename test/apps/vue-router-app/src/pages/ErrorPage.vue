<script setup lang="ts">
function triggerError() {
  throw new Error('Error triggered by button click')
}
</script>
<template>
  <div>
    <h1>Error Page</h1>
    <button id="error-button" @click="triggerError">Trigger Error</button>
  </div>
</template>
