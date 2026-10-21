<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type {} from '../browser'

const props = withDefaults(defineProps<{ idPrefix?: string }>(), { idPrefix: '' })
const stack = ref<string>()
const count = ref(0)
onMounted(() => {
  stack.value = new Error().stack
})
</script>

<template>
  <section :id="`${props.idPrefix}attribute-root`" :data-dd-element-stack="stack">
    <h2>DOM attribute</h2>
    <slot><p data-server-content="attribute">Attribute boundary</p></slot>
    <button :id="`${props.idPrefix}attribute-click`" @click="count++">Attribute click</button>
    <output>{{ count }}</output>
  </section>
</template>
