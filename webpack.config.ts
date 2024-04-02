import { resolve } from 'path';
import { type Configuration } from 'webpack';
export default {
  extends: "./webpack.base.config.ts",
  mode: "development",
  entry: "./index.js",
  output: {
    path: resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
} as Configuration;
