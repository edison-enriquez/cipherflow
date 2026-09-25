// Compila el motor de CyberChef para el navegador en public/engine/.
// Cada operación queda como un punto de entrada propio; esbuild reparte el código
// compartido en fragmentos, así que la app descarga solo lo que usan los bloques del lienzo.
import * as esbuild from "esbuild";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modulesDir = join(root, "node_modules/cyberchef/src/core/config/modules");
const outdir = join(root, "public/engine");
if (process.argv.includes("--si-falta") && existsSync(join(outdir, "manifest.json"))) process.exit(0);
const modules = readdirSync(modulesDir).filter(f => f.endsWith(".mjs") && f !== "OpModules.mjs").map(f => f.replace(".mjs", ""));
// Nombre visible de la operación → archivo de su clase, leído de los módulos generados por CyberChef.
const ops = {};
for (const m of modules) {
  const src = readFileSync(join(modulesDir, m + ".mjs"), "utf8");
  const files = Object.fromEntries([...src.matchAll(/import (\S+) from "\.\.\/\.\.\/operations\/(\S+)\.mjs";/g)].map(x => [x[1], x[2]]));
  for (const x of src.matchAll(/^\s+"([^"]+)": (\S+),$/gm)) if (files[x[2]]) ops[x[1]] = files[x[2]];
}
const opsDir = join(root, "node_modules/cyberchef/src/core/operations");

const vacios = ["child_process", "fs", "net", "tls", "vm", "worker_threads", "os", "http", "https", "readline", "module", "perf_hooks"];
const plugins = [
  {
    name: "node-builtins-vacios",
    setup(b) {
      b.onResolve({ filter: new RegExp(`^(${vacios.join("|")})$`) }, a => ({ path: a.path, namespace: "vacio" }));
      b.onResolve({ filter: /^node:/ }, a => ({ path: a.path.slice(5), namespace: "vacio" }));
      b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({ contents: "module.exports={}" }));
    },
  },
  {
    // El código GOST de CyberChef reasigna una importación, algo que esbuild no permite.
    name: "parche-gost",
    setup(b) {
      b.onLoad({ filter: /vendor[\\/]gost[\\/].*\.mjs$/ }, a => ({
        contents: readFileSync(a.path, "utf8").replace(/^(\s*)GostRandom = GostRandom \|\| root\.GostRandom;/gm, "$1// parcheado"),
        loader: "js",
      }));
    },
  },
  {
    // chi-squared (lo usa Magic) emplea `with (Math)`, prohibido en módulos ES.
    name: "parche-chi-squared",
    setup(b) {
      b.onLoad({ filter: /chi-squared[\\/]cdf\.js$/ }, a => ({
        contents: readFileSync(a.path, "utf8").replace(/with \(Math\) \{/g, "{ const { abs, exp, log, sqrt, pow, floor } = Math;"),
        loader: "js",
      }));
    },
  },
];

rmSync(outdir, { recursive: true, force: true });
const entryPoints = { core: join(root, "engine/core.mjs") };
for (const f of new Set(Object.values(ops))) entryPoints["op/" + f] = join(opsDir, f + ".mjs");

const t0 = Date.now();
const r = await esbuild.build({
  entryPoints,
  outdir,
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  platform: "browser",
  target: "es2022",
  chunkNames: "chunks/[hash]",
  define: { "process.browser": "true", global: "globalThis" },
  inject: [join(root, "engine/shim.js")],
  alias: { crypto: "crypto-browserify", stream: "stream-browserify", zlib: "browserify-zlib", path: "path", url: "url", events: "events", assert: "assert", buffer: "buffer", util: "util" },
  loader: { ".wasm": "base64", ".node": "empty", ".png": "dataurl", ".fnt": "text", ".traineddata": "empty" },
  resolveExtensions: [".mjs", ".js", ".json", ".cjs"],
  mainFields: ["browser", "module", "main"],
  logLevel: "error",
  metafile: true,
  legalComments: "none",
  plugins,
});

// Tamaño real de cada módulo: su archivo más todos los fragmentos que importa de forma estática.
const outs = r.metafile.outputs;
const rel = f => f.slice(f.indexOf("public/engine/"));
const transitive = file => {
  const seen = new Set(), stack = [file];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !outs[f]) continue;
    seen.add(f);
    outs[f].imports.filter(i => i.kind === "import-statement").forEach(i => stack.push(rel(i.path)));
  }
  return seen;
};
const keyOf = f => Object.keys(outs).find(k => k.endsWith("/" + f + ".js"));
const coreSet = transitive(keyOf("core"));
const size = set => [...set].reduce((a, f) => a + outs[f].bytes, 0);
const sizes = { core: size(coreSet) };
for (const f of new Set(Object.values(ops))) sizes[f] = size(new Set([...transitive(keyOf("op/" + f))].filter(x => !coreSet.has(x))));
writeFileSync(join(outdir, "manifest.json"), JSON.stringify({ ops, sizes }));
const total = Object.values(outs).reduce((a, o) => a + o.bytes, 0);
console.log(`Motor listo en ${((Date.now() - t0) / 1000).toFixed(1)} s: ${Object.keys(ops).length} operaciones, ${(total / 1e6).toFixed(1)} MB en total (public/engine).`);
