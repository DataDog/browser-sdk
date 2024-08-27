const path = require('path')

module.exports = (_env, argv) => ({
  entry: './app.ts',
  target: ['web', 'es2020'],
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app.js',
  },
})
