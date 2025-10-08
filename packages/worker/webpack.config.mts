import path from 'path'
import type webpack from 'webpack'
import webpackBase from '../../webpack.base.ts'

// eslint-disable-next-line import/no-default-export
export default (_env: unknown, argv: { mode?: webpack.Configuration['mode'] }) =>
  webpackBase({
    mode: argv.mode,
    entry: path.resolve(import.meta.dirname, 'src/entries/main.ts'),
    filename: 'worker.js',
  })
