<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <div>
    <h1>User {{ route.params.id }}</h1>
    <router-link to="/">Back to Home</router-link><br />
    <router-link :to="`/user/${route.params.id}#section`">Go to Section</router-link><br />
    <router-link :to="`/user/${route.params.id}?admin=false`">Change query params</router-link><br />
    <router-link to="/user/999?admin=true">Go to User 999</router-link>
  </div>
</template>
