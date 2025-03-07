import debug from "debug";
import crypto from "crypto";
import assert from "assert";
import path, { dirname } from "path";
import { promises as nativeFs } from "fs";
import CopyPlugin from "copy-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import { lowestCommonAncestor } from "lowest-common-ancestor";
import { type Configuration, type Compiler, ProvidePlugin, sources, Compilation } from "webpack";
import { initialize, serialize, deserialize, compress, promises as wasabioFs, decompress } from "wasabio";

const CACHE_FILE_NAME = "writeCache.json";
const PLUGIN_ID = "BrowserifyWebpackPlugin";
const { glob } = require("glob-gitignore");

function quickHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const log = debug(PLUGIN_ID);

const isProd = (args: any) => args?.mode === "production";
const getKeyedEnvironmentVariables = (env: any, key: string) =>
  (Object.entries(env)
    .filter(([k]) => k.startsWith(key))
    .map(([_, value]) => value) || []) as string[];
const getExcludes = (env: any) => getKeyedEnvironmentVariables(env, "exclude");
const getIncludes = (env: any) => getKeyedEnvironmentVariables(env, "include");
const skipCopying = (env: any) => "skipCopying" in env;

class BrowserifyWebpackPlugin {
  private readonly _name: string;
  private readonly _dist: string;
  private readonly _cache: string;
  private readonly _includes: string[];
  private readonly _excludes: string[];
  constructor(private readonly env: any) {
    this._includes = getIncludes(this.env);
    this._excludes = getExcludes(this.env);
    this._cache = this.env?.cache || "cache";
    this._name = this.env?.memory || "mem.zip";
    this._dist = this.env?.output || "dist";
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
    let writeCache = new Map<string, string>();
    try {
      assert(await nativeFs.stat(path.join(this._dist, this._name)), "unusable cache without a memory");
      const _writeCache = await nativeFs.readFile(path.join(this._cache, CACHE_FILE_NAME));
      writeCache = new Map(JSON.parse(_writeCache.toString()));
    } catch (e) {
      log("no write cache found");
    }
    let _mem: WebAssembly.Memory | undefined = undefined;
    try {
      const existing = await nativeFs.readFile(path.join(this._dist, this._name));
      log("found existing memory %s", this._name);
      const decompressed = await decompress(existing);
      _mem = deserialize(decompressed);
    } catch (e) {
      log("no existing memory found %s", this._name);
    }
    const mem = await initialize(_mem);
    const cwd = lowestCommonAncestor(...files);
    for (const file of files) {
      const src = file;
      const dst = src.replace(cwd, "");
      let content: Buffer | null = null;
      if ((await nativeFs.stat(src)).isDirectory()) {
        content = null;
      } else {
        content = await nativeFs.readFile(src);
      }
      const hash = content ? quickHash(content.toString()) : "";
      const isCached = writeCache.has(dst) && writeCache.get(dst) === hash;
      if (!isCached) {
        log("writing to %s", dst);
        if (content === null) {
          await wasabioFs.mkdir(dst, { recursive: true });
        } else {
          await wasabioFs.mkdir(dirname(dst), { recursive: true });
          await wasabioFs.writeFile(dst, content);
        }
        writeCache.set(dst, hash);
        log("wrote %s", dst);
      }
    }
    try {
      await nativeFs.mkdir(this._cache, { recursive: true });
      await nativeFs.writeFile(
        path.join(this._cache, CACHE_FILE_NAME),
        JSON.stringify(Array.from(writeCache.entries()))
      );
    } catch (e) {
      log("failed to write write cache %o", e);
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
        http: require.resolve("fakettp"),
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
      ...(skipCopying(env)
        ? []
        : [
            new CopyPlugin({
              patterns: [
                { from: require.resolve("fakettp/fakettp.html"), to: "." },
                { from: require.resolve("fakettp/fakettp.js"), to: "." },
                { from: require.resolve("fakettp/nosw.js"), to: "." },
              ],
            }),
          ]),
    ],
    node: {
      global: true,
    },
    performance: {
      hints: false,
    },
  };
};

export default BaseConfig;
