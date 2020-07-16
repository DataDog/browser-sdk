const path = require('path')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')

module.exports = {
  mode: 'production',
  devtool: 'inline-source-map',
  entry: {
    detectRum: path.resolve(__dirname, 'src/contentscript/detectRum.ts'),
    listenRumEvents: path.resolve(__dirname, 'src/contentscript/listenRumEvents.ts'),
    background: path.resolve(__dirname, 'src/background/background.ts'),
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        exclude: /node_modules/,
        test: /\.ts?$/,
        use: 'ts-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin()],
  },
}
