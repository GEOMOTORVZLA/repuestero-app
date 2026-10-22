import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
import { requireAuthenticatedUser } from "../_shared/requireAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "productos";
const MAX_DESCARGA = 10 * 1024 * 1024;
const MAX_SUBIDA = 2 * 1024 * 1024;
const LADO_MAX = 1000;
const LADO_THUMB = 400;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esSupabase(url: string): boolean {
  return url.includes("/storage/v1/object/public/");
}

function urlPermitida(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "0.0.0.0") return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)) return false;
  return true;
}

function idDrive(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "lh3.googleusercontent.com" || host.endsWith(".googleusercontent.com")) {
    const m = u.pathname.match(/\/d\/([^/]+)/);
    return m ? m[1] : null;
  }
  if (host === "drive.google.com") {
    const q = u.searchParams.get("id");
    if (q) return q;
    const m = u.pathname.match(/\/(?:file\/)?d\/([^/]+)/);
    return m ? m[1] : null;
  }
  return null;
}

function urlParaDescargar(original: string): string {
  const id = idDrive(original);
  if (id) return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}`;
  return original;
}

function esMagic(buf: Uint8Array): boolean {
  if (buf.byteLength < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function esHtml(buf: Uint8Array, tipo: string): boolean {
  if (tipo.startsWith("text/html") || tipo.startsWith("application/xhtml")) return true;
  const inicio = new TextDecoder().decode(buf.subarray(0, 32)).trim().toLowerCase();
  return inicio.startsWith("<!doctype") || inicio.startsWith("<html");
}

async function descargar(url: string): Promise<Uint8Array> {
  let ultimo = "no se pudo descargar";
  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      const res = await fetch(urlParaDescargar(url), {
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://geomotorvzla.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      });
      const tipo = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_DESCARGA) throw new Error("pesa más de 10 MB");
      if (esHtml(buf, tipo) || (!tipo.startsWith("image/") && !esMagic(buf))) {
        throw new Error(tipo ? `llegó ${tipo}, no una imagen` : "la respuesta no es una imagen");
      }
      return buf;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
      if (intento < 3) await new Promise((r) => setTimeout(r, intento * 1200));
    }
  }
  throw new Error(ultimo);
}

async function aJpeg(bytes: Uint8Array, ladoMax: number, calidadInicial: number): Promise<Uint8Array> {
  const img = await Image.decode(bytes);
  let actual = img.width > ladoMax ? img.resize(ladoMax, Image.RESIZE_AUTO) : img;
  let calidad = calidadInicial;
  let out = await actual.encodeJPEG(calidad);
  while (out.byteLength > MAX_SUBIDA && calidad > 52) {
    calidad -= 8;
    out = await actual.encodeJPEG(calidad);
  }
  if (out.byteLength > MAX_SUBIDA) {
    actual = actual.resize(Math.max(320, Math.round(actual.width * 0.75)), Image.RESIZE_AUTO);
    out = await actual.encodeJPEG(60);
  }
  if (out.byteLength > MAX_SUBIDA) throw new Error("después de comprimir sigue pesando más de 2 MB");
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });

  const auth = await requireAuthenticatedUser(req, { corsHeaders, maxPerHour: 20000 });
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json(500, { error: "Configuración del servidor incompleta." });

  let body: { producto_id?: string; urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Cuerpo inválido." });
  }

  const productoId = typeof body.producto_id === "string" ? body.producto_id.trim() : "";
  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).map((u) => u.trim()).slice(0, 4)
    : [];
  if (!productoId || urls.length === 0) return json(400, { error: "Faltan el producto o las fotos." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: producto, error: errProd } = await admin
    .from("productos")
    .select("id, tienda_id")
    .eq("id", productoId)
    .maybeSingle();
  if (errProd || !producto) return json(404, { error: "No se encontró el producto." });

  const { data: tienda } = await admin.from("tiendas").select("user_id").eq("id", producto.tienda_id).maybeSingle();
  const { data: usuario } = await admin.auth.admin.getUserById(auth.userId);
  const esAdmin = (usuario?.user?.app_metadata?.role ?? "") === "admin";
  const esDueno = tienda?.user_id === auth.userId;
  if (!esAdmin && !esDueno) return json(403, { error: "No puedes modificar las fotos de este producto." });

  const avisos: string[] = [];
  const guardadas: string[] = [];
  const marca = Date.now();

  for (let i = 0; i < urls.length; i += 1) {
    const original = urls[i];
    if (esSupabase(original)) {
      guardadas.push(original);
      continue;
    }
    if (!urlPermitida(original)) {
      avisos.push(`Foto ${i + 1}: enlace no permitido. Se dejó el original.`);
      guardadas.push(original);
      continue;
    }
    try {
      const binario = await descargar(original);
      const base = i === 0 ? "principal" : `extra-${i}`;
      const pathOriginal = `${productoId}/${base}.jpg`;
      const pathThumb = `${productoId}/${base}-thumb.jpg`;
      let jpeg: Uint8Array;
      let thumb: Uint8Array | null = null;
      try {
        jpeg = await aJpeg(binario, LADO_MAX, 82);
        thumb = await aJpeg(jpeg, LADO_THUMB, 78);
      } catch {
        if (binario.byteLength > MAX_SUBIDA || !esMagic(binario)) {
          throw new Error("no se pudo convertir la imagen y pesa más de 2 MB");
        }
        jpeg = binario;
      }
      const subida = await admin.storage.from(BUCKET).upload(pathOriginal, jpeg, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });
      if (subida.error) throw new Error(subida.error.message || "no se pudo subir la foto");
      if (thumb) {
        await admin.storage.from(BUCKET).upload(pathThumb, thumb, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: "31536000",
        });
      }
      guardadas.push(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${pathOriginal}?v=${marca}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "no se pudo copiar";
      avisos.push(`Foto ${i + 1}: ${msg}. Se dejó el enlace original.`);
      guardadas.push(original);
    }
  }

  const imagenUrl = guardadas[0] ?? null;
  const extras = guardadas.length > 1 ? guardadas.slice(1) : null;
  const { error: updError } = await admin
    .from("productos")
    .update({ imagen_url: imagenUrl, imagenes_extra: extras })
    .eq("id", productoId);
  if (updError) return json(500, { error: updError.message || "No se pudo guardar la foto en el producto." });

  return json(200, { ok: true, imagen_url: imagenUrl, avisos });
});
