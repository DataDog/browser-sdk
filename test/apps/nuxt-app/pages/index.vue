<template>
  <div>
    <h1>Home</h1>
    <NuxtLink data-testid="go-to-user" to="/user/42?admin=true">Go to User 42</NuxtLink><br />
    <NuxtLink data-testid="go-to-guides" to="/guides/123">Go to Guides 123</NuxtLink><br />
    <NuxtLink data-testid="go-to-error-test" to="/error-test">Go to Error Test</NuxtLink><br />
  </div>
</template>
