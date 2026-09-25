// Comprobaciones rápidas sobre dist/ antes de publicar.
import { existsSync, readFileSync, readdirSync } from "node:fs";

const fail = msg => { console.error("✗ " + msg); process.exit(1); };
const dist = new URL("../dist/", import.meta.url);
if (!existsSync(new URL("index.html", dist))) fail("Falta dist/index.html.");
const manifest = JSON.parse(readFileSync(new URL("engine/manifest.json", dist), "utf8"));
const ops = Object.keys(manifest.ops);
if (ops.length < 400) fail(`El motor solo trae ${ops.length} operaciones.`);
for (const f of ["core.js", "op/AESEncrypt.js", "op/ToBase64.js", "op/SHA2.js"]) {
  if (!existsSync(new URL("engine/" + f, dist))) fail(`Falta dist/engine/${f}.`);
}
const html = readFileSync(new URL("index.html", dist), "utf8");
if (!html.includes("/cipherflow/assets/")) fail("index.html no usa la ruta base /cipherflow/.");
console.log(`✓ dist listo: ${ops.length} operaciones, ${readdirSync(new URL("engine/chunks/", dist)).length} fragmentos compartidos.`);
