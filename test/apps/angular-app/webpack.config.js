const path = require('node:path')
// eslint-disable-next-line import/no-unresolved
const { AngularWebpackPlugin } = require('@ngtools/webpack')

module.exports = {
  mode: 'production',
  entry: './main.ts',
  target: ['web', 'es2022'],
  module: {
    rules: [
      { test: /\.ts$/, use: '@ngtools/webpack' },
      {
        test: /\.[cm]?js$/,
        include: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: ['@angular/compiler-cli/linker/babel'],
            compact: false,
            cacheDirectory: true,
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new AngularWebpackPlugin({
      tsconfig: path.resolve(__dirname, 'tsconfig.json'),
      jitMode: false,
    }),
  ],
  optimization: {
    chunkIds: 'named',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'angular-app.js',
    chunkFilename: 'chunks/[name]-[contenthash]-angular-app.js',
  },
}
