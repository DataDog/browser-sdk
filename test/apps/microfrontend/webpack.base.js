const path = require('node:path')

module.exports = ({ name, plugins, entry }) => ({
  mode: 'development',
  ...(entry ? { entry } : {}),
  devtool: 'source-map',
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader' }],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: `${name}.js`,
    chunkFilename: `chunks/[name]-[contenthash]-${name}.js`,
    publicPath: 'auto',
  },
  plugins,
})
