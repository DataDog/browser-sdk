import path from 'path'
import type webpack from 'webpack'
import webpackBase from '../../webpack.base.ts'

export default (_env: never, argv: { mode?: webpack.Configuration['mode'] }) =>
  webpackBase({
    mode: argv.mode,
    entry: path.resolve(import.meta.dirname, 'src/entries/main.ts'),
    filename: 'datadog-rum.js',
  })
