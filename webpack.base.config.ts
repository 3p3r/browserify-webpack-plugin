import debug from "debug";
import { dirname } from "path";
import { promises as nativeFs } from "fs";
import TerserPlugin from "terser-webpack-plugin";
import { lowestCommonAncestor } from "lowest-common-ancestor";
import { initialize, serialize, compress, promises as wasabioFs } from "wasabio";
import { type Configuration, type Compiler, ProvidePlugin, DefinePlugin, sources, Compilation } from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import InjectPlugin from "webpack-inject-plugin";
import CopyPlugin from "copy-webpack-plugin";

const PLUGIN_ID = "BrowserifyWebpackPlugin";
const { glob } = require("glob-gitignore");

const log = debug(PLUGIN_ID);

const isProd = (args: any) => args?.mode === "production";
const getKeyedEnvironmentVariables = (env: any, key: string) =>
  (Object.entries(env)
    .filter(([k]) => k.startsWith(key))
    .map(([_, value]) => value) || []) as string[];
const getExcludes = (env: any) => getKeyedEnvironmentVariables(env, "exclude");
const getIncludes = (env: any) => getKeyedEnvironmentVariables(env, "include");

class BrowserifyWebpackPlugin {
  private readonly _name: string;
  private readonly _includes: string[];
  private readonly _excludes: string[];
  constructor(private readonly env: any) {
    this._includes = getIncludes(env);
    this._excludes = getExcludes(env);
    this._name = env?.memory || "mem.zip";
  }
  apply(compiler: Compiler) {
    log("applying %s", PLUGIN_ID);
    compiler.hooks.thisCompilation.tap(PLUGIN_ID, (compilation: Compilation) => {
      log("compilation tapped %s", PLUGIN_ID);
      compilation.hooks.processAssets.tapPromise(
        {
          name: PLUGIN_ID,
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        async () => {
          log("processing assets tapped %s", PLUGIN_ID);
          const files = await this._globIncludedPaths();
          if (files.length) {
            log("writing included files into wasabio memory: %o", files);
            const compressed = await this._makeWasabioMemory(files);
            const asset = new sources.RawSource(Buffer.from(compressed), false);
            log("emitting asset %s", this._name);
            compilation.emitAsset(this._name, asset);
          }
        }
      );
    });
  }
  private async _makeWasabioMemory(files: string[]): Promise<Uint8Array> {
    const mem = await initialize();
    const cwd = lowestCommonAncestor(...files);
    const datum = await Promise.all(
      files.map(async (src) => {
        let content: Buffer | null = null;
        const dst = src.replace(cwd, "");
        if ((await nativeFs.stat(src)).isDirectory()) {
          content = null;
        } else {
          content = await nativeFs.readFile(src);
        }
        return { dst, content };
      })
    );
    for (const data of datum) {
      log("writing to %s", data.dst);
      if (data.content === null) {
        await wasabioFs.mkdir(data.dst, { recursive: true });
      } else {
        await wasabioFs.mkdir(dirname(data.dst), { recursive: true });
        await wasabioFs.writeFile(data.dst, data.content);
      }
    }
    const serialized = serialize(mem);
    const compressed = await compress(serialized);
    return compressed;
  }
  private async _globIncludedPaths(): Promise<string[]> {
    const files = await Promise.all(
      this._includes.map((pattern) => glob(pattern, { ignore: this._excludes, absolute: true }))
    );
    const flat = files.flat();
    const unique = Array.from(new Set(flat));
    return unique;
  }
}

const BaseConfig = (env: any, args: any): Partial<Configuration> => {
  const mode = isProd(args) ? "production" : "development";
  return {
    mode,
    target: "web",
    devtool: isProd(args) ? false : "inline-source-map",
    output: {
      libraryTarget: "umd",
      umdNamedDefine: true,
      // normalizes support across workers, node and browser environments
      globalObject: "(typeof self !== 'undefined' ? self : globalThis)",
    },
    resolve: {
      extensions: [".js", ".ts", ".json", ".jsx", ".tsx", ".mjs", ".cjs"],
      fallback: {
        assert: require.resolve("assert/"),
        async_hooks: false,
        buffer: require.resolve("buffer/"),
        // child_process: require.resolve("brocesses"),
        child_process: false,
        // console: require.resolve("console-browserify"),
        constants: require.resolve("constants-browserify"),
        crypto: require.resolve("crypto-browserify"),
        domain: require.resolve("domain-browser"),
        events: require.resolve("events/"),
        fs: require.resolve("wasabio"),
        http: require.resolve("fakettp/build"),
        https: false,
        net: require.resolve("net-browserify"),
        os: require.resolve("os-browserify/browser"),
        path: require.resolve("path-browserify"),
        process: require.resolve("./mods/process"),
        punycode: require.resolve("punycode/"),
        querystring: require.resolve("querystring-es3"),
        stream: require.resolve("stream-browserify"),
        string_decoder: require.resolve("string_decoder/"),
        sys: require.resolve("util/"),
        timers: require.resolve("timers-browserify"),
        tls: false,
        tty: [require.resolve("./mods/process"), "tty"],
        url: require.resolve("url/"),
        util: require.resolve("util/"),
        vm: require.resolve("vm-browserify"),
        zlib: require.resolve("browserify-zlib"),
      },
    },
    bail: true,
    optimization: {
      minimize: isProd(args),
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              comments: false,
            },
          },
          extractComments: false,
        }),
      ],
    },
    plugins: [
      new ProvidePlugin({
        process: [require.resolve("./mods/process"), "default"],
        // console: require.resolve("console-browserify"),
        Buffer: [require.resolve("buffer/"), "Buffer"],
      }),
      new BrowserifyWebpackPlugin(env),
      new HtmlWebpackPlugin({
        title: "",
        filename: "app.html",
        templateContent: `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title><%= htmlWebpackPlugin.options.title %></title>
    <style>
      body,
      html {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        display: block;
        overflow: hidden;
      }
      body {
        background-color: white;
        background-position: center center;
        background-repeat: no-repeat;
        /* OG Steve Jobs iPhone Spinner */
        background-image: url("data:image/gif;base64,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");
        background-size: 24px;
      }
    </style>
  </head>
  <body>
  </body>
</html>`,
      }),
      new InjectPlugin(function () {
        return `localStorage.debug = "${isProd(args) ? "" : "*"}"`;
      }),
      new CopyPlugin({
        patterns: [
          { from: require.resolve("fakettp/fakettp.js"), to: "." },
          { from: require.resolve("fakettp/nosw.js"), to: "." },
        ],
      }),
      new DefinePlugin({
        [`process.env.DEBUG`]: JSON.stringify(`${isProd(args) ? "" : "*"}`),
        [`process.env.FAKETTP_MODE`]: JSON.stringify(mode),
        [`process.env.FAKETTP_MAIN`]: JSON.stringify("fakettp.js"),
      }),
    ],
    node: {
      global: true,
      __dirname: "mock", // always "/"
      __filename: "mock", // always "./index.js"
    },
    performance: {
      hints: false,
    },
  };
};

export default BaseConfig;
