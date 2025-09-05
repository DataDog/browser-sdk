const path = require('path')

module.exports = {
  mode: 'production',
  target: ['web', 'es2018'],
  entry: {
    'npm-content-script': './src/npmContentScript.ts',
    'cdn-content-script': './src/cdnContentScript.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
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
