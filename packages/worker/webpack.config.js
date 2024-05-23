const path = require('path')

const webpackBase = require('../../webpack.base')

module.exports = (_env, argv) =>
  webpackBase({
    entry: path.resolve(__dirname, 'src/entries/main.ts'),
    mode: argv.mode,
    filename: 'worker.js',
  })
