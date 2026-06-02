<script setup lang="ts">
import { UNSTABLE_useVueComponentTracker } from '@datadog/browser-rum-vue'
UNSTABLE_useVueComponentTracker('TrackedPage')
</script>
<template>
  <div>
    <h1>Component Tracker</h1>
  </div>
</template>
