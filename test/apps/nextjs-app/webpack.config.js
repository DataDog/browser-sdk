const path = require('node:path')

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
    alias: {
      'next/navigation': path.resolve(__dirname, 'mockNextNavigation.tsx'),
    },
  },
  optimization: {
    chunkIds: 'named',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'nextjs-app.js',
    chunkFilename: 'chunks/[name]-[contenthash]-nextjs-app.js',
  },
}
