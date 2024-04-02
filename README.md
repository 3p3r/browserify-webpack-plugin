# browserify-webpack-plugin [^1]

Simple, yet comprehensive webpack plugin to bundle almost any javascript/typescript project for modern browsers.

Level of support is the union of both Webpack[^2] and Browserify[^3] shims, in addition to the following features:

- [x] Multi-threaded in-memory filesystem through [wasabio](https://github.com/3p3r/wasabio).
- [x] Network-less in-browser http server through [fakettp](https://github.com/3p3r/fakettp).
- [x] Dockerized and virtual child processes with [brocess](https://github.com/3p3r/brocess).

This plugin also takes care of selectively applying these shims and properly initialize their respective libraries.

## Usage

This plugin uses Webpack's ["Extends"](https://webpack.js.org/configuration/extending-configurations/#extends) feature
in its configuration. This allows you more flexibility in how you configure your project.

```bash
# in your project directory
npm install --save-dev browserify-webpack-plugin
```

```javascript
// webpack.config.js
const path = require("path");
module.exports = {
  extends: require.resolve("browserify-webpack-plugin"),
  mode: "development",
  entry: "./index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
};
```

The plugin accepts a few command line arguments:

- `--env include**="<pathOrGlob>"` where `**` may be optionally repeated with different values to form an array and self document what is being included next to the bundle.
- `--env exclude**="<pathOrGlob>"` where `**` may be optionally substituted just like above, these patterns will be excluded from the emitted memory asset.
- `--env memory="<unique>"` where `<unique>` is `mem.zip` by default. This is `wasabio`'s starter memory archive.
- `--env listen="<address>"` where `<address>` is `localhost:8080` by default. This is `fakettp`'s starter address.
- `--env docker="<image>"` where `<image>` is `Latest Debian Slim` by default. This is `brocess`'s starter container.

Example invocation in your repository after extending this package in your `webpack.config.js`:

```bash
# emits "mem.zip" in the output directory which includes the following globs in wasabio's memory:
webpack --env includeSrc='mods/*' --env includeIndex='index.js' --env exclude='tty.ts'
```

[^1]: This project is not associated with the original Browserify project.
[^2]: [Webpack's documented resolve fallbacks](https://webpack.js.org/configuration/resolve/#resolvefallback)
[^3]: [Browserify's documented builtin transforms](https://github.com/browserify/browserify-handbook?tab=readme-ov-file#builtins)
