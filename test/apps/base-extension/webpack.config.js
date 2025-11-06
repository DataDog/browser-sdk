const path = require('node:path')

module.exports = {
  mode: 'production',
  target: ['web', 'es2018'],
  entry: {
    base: './src/base.ts',
    cdn: './src/cdn.ts',
    appendChild: './src/appendChild.ts',
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
