<template>
  <nav>
    <router-link to="/">Home</router-link> | <router-link to="/user/42">User 42</router-link> |
    <router-link to="/tracked">Tracked</router-link> |
    <router-link to="/error-test">Error</router-link>
  </nav>
  <RouterView />
</template>
