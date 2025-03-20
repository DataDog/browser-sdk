const webpackBase = require('./webpack.base')

module.exports = () =>
  webpackBase({
    mode: 'development',
    target: ['node', 'es2018'],
    optimization: {
      minimize: true,
    },
  })
