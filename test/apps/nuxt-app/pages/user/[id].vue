<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div>
    <h1>User {{ route.params.id }}</h1>
    <NuxtLink data-testid="back-to-home" to="/">Back to Home</NuxtLink><br />
    <NuxtLink data-testid="go-to-section" :to="`/user/${route.params.id}#section`">Go to Section</NuxtLink><br />
    <NuxtLink data-testid="change-query-params" :to="`/user/${route.params.id}?admin=false`"
      >Change query params</NuxtLink
    ><br />
    <NuxtLink data-testid="go-to-other-user" to="/user/999?admin=true">Go to User 999</NuxtLink>
  </div>
</template>
