const typescript = require('rollup-plugin-typescript2')
const nodeResolve = require('@rollup/plugin-node-resolve')

module.exports = {
  input: './app.ts',
  output: {
    dir: 'dist',
    format: 'es',
  },
  plugins: [
    nodeResolve(),
    typescript({
      useTsconfigDeclarationDir: true,
    }),
  ],
}
