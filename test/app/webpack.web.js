const webpackBase = require('./webpack.base')

module.exports = () =>
  webpackBase({
    mode: 'production',
    target: ['web', 'es2018'],
    optimization: { chunkIds: 'named' },
  })
