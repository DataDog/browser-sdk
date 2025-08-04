const path = require('path')

module.exports = {
  mode: 'production',
  entry: './app.tsx',
  target: ['web', 'es2018'],
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
  optimization: {
    chunkIds: 'named',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '/* REACT_OUTPUT_FILENAME */',
    chunkFilename: 'chunks/[name]-[contenthash]-/* REACT_OUTPUT_FILENAME */',
  },
}
