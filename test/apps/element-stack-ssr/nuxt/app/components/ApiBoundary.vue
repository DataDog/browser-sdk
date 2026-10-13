<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type {} from '../../../browser'

const props = withDefaults(defineProps<{ idPrefix?: string }>(), { idPrefix: '' })
const root = ref<HTMLElement | null>(null)
const count = ref(0)
onMounted(() => {
  if (root.value) {
    window.registerPrototypeSource(new Error().stack, 'checkout-nuxt')
    window.DD_RUM.attachElementStack(root.value)
  }
})
</script>

<template>
  <section :id="`${props.idPrefix}api-root`" ref="root">
    <h2>SDK API</h2>
    <slot><p data-server-content="api">Server-rendered API content</p></slot>
    <button :id="`${props.idPrefix}api-click`" @click="count++">API click</button>
    <output>{{ count }}</output>
  </section>
</template>
