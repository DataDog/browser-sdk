<template>
  <div>
    <h1>Home</h1>
    <router-link data-testid="go-to-user" to="/user/42?admin=true">Go to User 42</router-link><br />
    <router-link data-testid="go-to-guides" to="/guides/123">Go to Guides 123</router-link><br />
    <router-link data-testid="go-to-error-test" to="/error-test">Go to Error Test</router-link>
  </div>
</template>
