const path = require("path");
const webpack = require("webpack");
const keysTransformer = require("ts-transformer-keys/transformer").default;
const packageJson = require("./package.json");

module.exports = (env, argv) => ({
  entry: "./src/index.ts",
  devtool: argv.mode === "development" ? "inline-source-map" : "false",
  devServer: {
    contentBase: "./dist"
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: {
          getCustomTransformers: program => ({
            before: [keysTransformer(program)]
          })
        }
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      buildEnv: {
        VERSION: JSON.stringify(argv.mode === "development" ? "dev" : packageJson.version)
      }
    })
  ],
  resolve: {
    extensions: [".ts", ".js"]
  },
  output: {
    filename: "browser-agent.js",
    path: path.resolve(__dirname, "dist")
  }
});
