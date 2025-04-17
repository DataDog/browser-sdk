const path = require('path')
const webpack = require('webpack')

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
  plugins: [
    new webpack.DefinePlugin({
      __BUILD_ENV__SDK_VERSION__: JSON.stringify('env'),
    }),
  ],
}
