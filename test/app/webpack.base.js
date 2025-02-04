const path = require('path')

const filename = 'app.js'
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
    filename,
    chunkFilename: `chunks/[name]-[contenthash]-${filename}`,
  },
})
