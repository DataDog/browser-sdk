const path = require("path");

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
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  output: {
    filename: "browser-agent.js",
    path: path.resolve(__dirname, "dist")
  }
});
