/**
 * Despliega identificar-repuesto-vision sin menu interactivo si defines SUPABASE_PROJECT_REF.
 * El ref es el subdominio de VITE_SUPABASE_URL: https://<REF>.supabase.co
 *
 * PowerShell (comillas solo alrededor del valor; no pegues comillas dentro del string):
 *   $env:SUPABASE_PROJECT_REF = "abcdefghijklmnopqrst"
 *   npm run supabase:deploy-vision
 *
 * Dashboard: Project Settings -> General -> Reference ID (20 caracteres, minusculas y numeros).
 */
import { spawnSync } from "node:child_process";

/** Evita fallos por comilla tipografica o comilla pegada al final al copiar. */
function normalizeProjectRef(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  s = s.replace(/^[\u201C\u201D\u2018\u2019"']+/, "");
  s = s.replace(/[\u201C\u201D\u2018\u2019"']+$/, "");
  return s.trim();
}

const refRaw = process.env.SUPABASE_PROJECT_REF;
const ref = normalizeProjectRef(refRaw);

if (refRaw != null && String(refRaw).trim() !== "" && ref === "") {
  console.error(
    "[deploy-vision] SUPABASE_PROJECT_REF quedo vacio tras quitar comillas. Revisa lo que pegaste."
  );
  process.exit(1);
}

if (ref && !/^[a-z0-9]{20}$/.test(ref)) {
  console.error(
    "[deploy-vision] Reference ID invalido. Debe ser exactamente 20 caracteres (a-z y 0-9), como en Supabase -> Settings -> General."
  );
  console.error(
    "  Valor normalizado (longitud " + ref.length + "):",
    JSON.stringify(ref)
  );
  console.error(
    "  Tip: en PowerShell usa comillas rectas: $env:SUPABASE_PROJECT_REF = \"tu_ref_de_20_chars\""
  );
  process.exit(1);
}

const args = ["supabase", "functions", "deploy", "identificar-repuesto-vision"];
if (ref) {
  args.push("--project-ref", ref);
}

const r = spawnSync("npx", args, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, SUPABASE_PROJECT_REF: ref || process.env.SUPABASE_PROJECT_REF },
});

process.exit(r.status === null ? 1 : r.status);
