<template>
  <main>
    <h1>Nuxt — element stack SSR prototype</h1>
    <p>All three sections are server-rendered. Registration runs only when they mount in the browser.</p>
    <ApiBoundary />
    <PropertyBoundary />
    <AttributeBoundary />
    <h2>Click events (beforeSend)</h2>
    <pre id="events">Click a button to inspect its attribution.</pre>
  </main>
</template>
