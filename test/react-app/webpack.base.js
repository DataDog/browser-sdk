const path = require('path')

const filename = 'react-app.js'
module.exports = ({ target, optimization, mode }) => ({
  mode,
  entry: './app.tsx',
  target,
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  optimization,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename,
    chunkFilename: `chunks/[name]-[contenthash]-${filename}`,
  },
})
