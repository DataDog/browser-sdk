const path = require('path')

const filename = 'app.js'
module.exports = ({ target, optimization, mode, types }) => ({
  mode,
  entry: './app.ts',
  target,
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        options: {
          onlyCompileBundledFiles: true,
          compilerOptions: {
            module: 'es2020',
            allowJs: true,
            types: types || [],
          },
        },
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
