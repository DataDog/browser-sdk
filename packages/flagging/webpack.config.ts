import path from 'path'
import webpack from 'webpack'
import webpackBase from '../../webpack.base.ts'

export default (_env: unknown, argv: { mode?: webpack.Configuration['mode'] }) =>
  webpackBase({
    mode: argv.mode,
    entry: path.resolve(import.meta.dirname, 'src/entries/main.ts'),
    filename: 'datadog-flagging.js',
  })

