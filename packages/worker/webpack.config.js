const path = require('path')

const webpackBase = require('../../webpack.base')

module.exports = (_env, argv) =>
  webpackBase({
    mode: argv.mode,
    publicPath: argv.publicPath,
    entry: path.resolve(__dirname, 'src/entries/main.ts'),
    filename: 'worker.js',
  })
