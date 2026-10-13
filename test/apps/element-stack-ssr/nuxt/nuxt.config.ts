export default defineNuxtConfig({
  ssr: true,
  app: {
    head: {
      script: [
        { src: '/prototype-sdk.js', tagPosition: 'head' },
        { src: '/prototype-runtime.js', tagPosition: 'head' },
      ],
    },
  },
})
