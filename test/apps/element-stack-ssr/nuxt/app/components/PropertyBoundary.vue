<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type {} from '../../../browser'

const props = withDefaults(defineProps<{ idPrefix?: string }>(), { idPrefix: '' })
const root = ref<HTMLElement | null>(null)
const count = ref(0)
onMounted(() => {
  if (root.value) {
    window.registerPrototypeSource(new Error().stack, 'checkout-nuxt')
    root.value.dd_element_stack = new Error().stack
  }
})
</script>

<template>
  <section :id="`${props.idPrefix}property-root`" ref="root">
    <h2>Custom property</h2>
    <slot><p data-server-content="property">Server-rendered property content</p></slot>
    <button :id="`${props.idPrefix}property-click`" @click="count++">Property click</button>
    <output>{{ count }}</output>
  </section>
</template>
