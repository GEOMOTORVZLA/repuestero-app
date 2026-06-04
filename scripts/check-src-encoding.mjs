/**
 * Falla si algún .ts/.tsx bajo src/ parece UTF-16 LE (Vite/Babel rompen con "Unexpected character").
 * Uso: node scripts/check-src-encoding.mjs
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mts|cts)$/i.test(ent.name)) acc.push(p);
  }
  return acc;
}

const root = path.join(process.cwd(), "src");
if (!fs.existsSync(root)) {
  console.error("[check-src-encoding] No existe carpeta src/");
  process.exit(1);
}

const bad = [];
for (const file of walk(root)) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 4 && buf[0] === 0x69 && buf[1] === 0x00 && buf[2] === 0x6d && buf[3] === 0x00) {
    bad.push(file);
  }
}

if (bad.length) {
  console.error("[check-src-encoding] Archivos sospechosos UTF-16 LE (empiezan como i\\0m\\0p\\0):");
  for (const f of bad) console.error("  ", f);
  process.exit(1);
}

console.log("[check-src-encoding] OK: ningún .ts/.tsx en src/ parece UTF-16 LE.");
