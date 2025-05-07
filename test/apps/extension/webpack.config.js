const path = require('path')

module.exports = {
  mode: 'production',
  target: ['web', 'es2018'],
  entry: './src/contentScript.js',
  output: {
    filename: 'content-script.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '',
  },
  optimization: {
    chunkIds: 'named',
  },
}
