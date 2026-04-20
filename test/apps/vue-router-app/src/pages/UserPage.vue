<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <div>
    <h1>User {{ route.params.id }}</h1>
    <router-link data-testid="back-to-home" to="/">Back to Home</router-link><br />
    <router-link data-testid="go-to-section" :to="`/user/${route.params.id}#section`">Go to Section</router-link><br />
    <router-link data-testid="change-query-params" :to="`/user/${route.params.id}?admin=false`"
      >Change query params</router-link
    ><br />
    <router-link data-testid="go-to-other-user" to="/user/999?admin=true">Go to User 999</router-link>
  </div>
</template>
