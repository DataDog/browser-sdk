const path = require('node:path')

module.exports = {
  mode: 'production',
  entry: './src/app.ts',
  target: ['web', 'es2018'],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  optimization: {
    chunkIds: 'named',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app.js',
  },
}
