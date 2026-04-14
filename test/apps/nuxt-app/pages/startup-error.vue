<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  throw new Error('Nuxt startup error from app:error')
})
</script>

<template>
  <div>Startup Error</div>
</template>
