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
      new HtmlWebpackPlugin({ title: "" }),
      new InjectPlugin(function () {
        return `localStorage.debug = "${isProd(args) ? "" : "*"}"`;
      }),
      new CopyPlugin({
        patterns: [{ from: require.resolve("fakettp/fakettp.js"), to: "." }],
      }),
      new DefinePlugin({
        [`process.env.DEBUG`]: JSON.stringify(`${isProd(args) ? "" : "*"}`),
        [`process.env.WEBPACK_MODE`]: JSON.stringify(mode),
        [`process.env.WEBPACK_FILENAME`]: JSON.stringify("fakettp.js"),
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
