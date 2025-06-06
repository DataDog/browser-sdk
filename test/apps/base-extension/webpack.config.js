const path = require('path')

module.exports = {
  mode: 'production',
  target: ['web', 'es2018'],
  entry: {
    'content-script': './src/contentScript.ts',
    'background': './src/background.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '',
  },
  optimization: {
    chunkIds: 'named',
  },
}
