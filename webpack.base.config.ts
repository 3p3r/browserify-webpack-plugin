import debug from "debug";
import { dirname } from "path";
import { promises } from "fs";
import { initialize, writeFileSync, mkdirSync, serialize, compress } from "wasabio";
import { type Configuration, type Compiler, ProvidePlugin, sources, Compilation } from "webpack";

const PLUGIN_ID = "BrowserifyWebpackPlugin";
const BomPlugin = require("webpack-utf8-bom");
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
          const files = await this._getIncludedFiles();
          if (files.length) {
            log("writing included files into wasabio memory: %o", files);
            const compressed = await this._getWasabioMemory(files);
            const asset = new sources.RawSource(Buffer.from(compressed), false);
            log("emitting asset %s", this._name);
            compilation.emitAsset(this._name, asset);
          }
        }
      );
    });
  }
  private async _getWasabioMemory(files: string[]): Promise<Uint8Array> {
    const mem = await initialize();
    for (const { src, dst } of files.map((file) => ({
      src: file,
      dst: file.replace(process.cwd(), ""),
    }))) {
      log("writing %s to %s", src, dst);
      const srcData = await promises.readFile(src);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, srcData);
    }
    const serialized = serialize(mem);
    const compressed = await compress(serialized);
    return compressed;
  }
  private async _getIncludedFiles(): Promise<string[]> {
    const files = await Promise.all(
      this._includes.map((pattern) => glob(pattern, { ignore: this._excludes, absolute: true }))
    );
    const flat = files.flat();
    const unique = Array.from(new Set(flat));
    return unique;
  }
}

const BaseConfig = (env: any, args: any): Partial<Configuration> => {
  return {
    target: "web",
    devtool: isProd(args) ? false : "inline-source-map",
    mode: isProd(args) ? "production" : "development",
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
        console: require.resolve("console-browserify"),
        constants: require.resolve("constants-browserify"),
        crypto: require.resolve("crypto-browserify"),
        domain: require.resolve("domain-browser"),
        events: require.resolve("events/"),
        fs: require.resolve("wasabio"),
        http: require.resolve("fakettp/build"),
        https: require.resolve("./mods/https"),
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
        tty: require.resolve("./mods/tty"),
        url: require.resolve("url/"),
        util: require.resolve("util/"),
        vm: require.resolve("vm-browserify"),
        zlib: require.resolve("browserify-zlib"),
      },
    },
    plugins: [
      new ProvidePlugin({
        global: "globalThis",
        process: "process/browser",
        console: "console-browserify",
        Buffer: ["buffer", "Buffer"],
        setImmediate: ["timers", "setImmediate"],
        clearImmediate: ["timers", "clearImmediate"],
      }),
      new BrowserifyWebpackPlugin(env),
      // must be last
      new BomPlugin(true),
    ],
    node: {
      global: true,
      __dirname: "mock", // always "/"
      __filename: "mock", // always "./index.js"
    },
  };
};

export default BaseConfig;
