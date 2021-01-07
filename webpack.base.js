const path = require('path')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')

const tsconfigPath = path.join(__dirname, 'tsconfig.base.json')

module.exports = (mode) => ({
  mode,
  devtool: mode === 'development' ? 'inline-source-map' : 'false',
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
          configFile: tsconfigPath,
          onlyCompileBundledFiles: true,
          compilerOptions: {
            module: 'es6',
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin({ configFile: tsconfigPath })],
  },
})
