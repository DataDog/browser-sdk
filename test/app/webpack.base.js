const path = require('path')

module.exports = ({ target, optimization, mode }) => ({
  mode,
  entry: './app.ts',
  target,
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
  optimization,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app.js',
  },
})
