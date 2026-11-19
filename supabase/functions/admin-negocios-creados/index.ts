import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIPOS_GRUA = ["plataforma", "tiro_gancho", "motos", "pesada"];
const ESPECIALIDADES_AUTO = [
  "Mecánica Ligera",
  "Mecánica Pesada",
  "Frenos",
  "Inyección",
  "Latonería y Pintura",
  "Reparación de Cajas AT/Sinc",
  "Electroauto",
  "Suspensiones",
  "Cajetines de dirección",
  "Personalización",
  "Camiones",
  "Tapicería automotriz",
  "Aire acondicionado",
  "Autolavados",
  "Reparación de computadoras",
  "Codificación de llaves",
  "Instalación de sonido",
  "Alineación y balanceo de cauchos",
  "Reparación de chasis y compacto",
  "Reparación de mecanismos eleva vidrios",
];
const ESPECIALIDADES_MOTO = [
  "Mecánica Ligera",
  "Mecánica Pesada",
  "Electroauto",
  "Latonería y Pintura",
];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function texto(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function coord(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function coordValida(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  if (lat < 0.5 || lat > 12.6) return false;
  if (lng < -73.4 || lng > -59.8) return false;
  return true;
}

function listaTexto(value: unknown, permitidas: Set<string>): string[] {
  return (Array.isArray(value) ? value : [])
    .map((x) => String(x).trim())
    .filter((x) => permitidas.has(x));
}

type AdminClient = SupabaseClient;

async function exigirAdmin(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: json(401, { ok: false, error: "Debes iniciar sesión como administrador." }) };
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user || (data.user.app_metadata?.role ?? "") !== "admin") {
    return { error: json(403, { ok: false, error: "No autorizado." }) };
  }
  return { userId: data.user.id };
}

async function listar(admin: AdminClient) {
  const creados: { id: string; email: string }[] = [];
  for (let page = 1; page <= 25; page += 1) {
    const res = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (res.error) return { error: res.error.message };
    const batch = res.data.users ?? [];
    for (const user of batch) {
      const meta = user.user_metadata ?? {};
      if (meta.creado_por_admin === true && user.email) {
        creados.push({ id: user.id, email: user.email });
      }
    }
    if (batch.length < 200) break;
  }
  if (creados.length === 0) return { filas: [] };
  const ids = creados.map((u) => u.id);
  const correo = new Map(creados.map((u) => [u.id, u.email]));

  const [tiendas, talleres, gruas] = await Promise.all([
    admin
      .from("tiendas")
      .select("id, user_id, nombre, nombre_comercial, rif, telefono, estado, ciudad, latitud, longitud, vertical")
      .in("user_id", ids),
    admin
      .from("talleres")
      .select(
        "id, user_id, nombre, nombre_comercial, rif, telefono, estado, ciudad, latitud, longitud, vertical, especialidad"
      )
      .in("user_id", ids),
    admin
      .from("gruas")
      .select(
        "id, user_id, nombre, nombre_comercial, rif, telefono, estado, ciudad, latitud, longitud, tipos, servicio_24h, auxilio_vial"
      )
      .in("user_id", ids),
  ]);
  const fallo = tiendas.error || talleres.error || gruas.error;
  if (fallo) return { error: fallo.message };

  const filas = [
    ...(tiendas.data ?? []).map((row) => ({ ...row, tipo: "vendedor", email: correo.get(row.user_id) ?? "" })),
    ...(talleres.data ?? []).map((row) => ({ ...row, tipo: "taller", email: correo.get(row.user_id) ?? "" })),
    ...(gruas.data ?? []).map((row) => ({ ...row, tipo: "grua", email: correo.get(row.user_id) ?? "" })),
  ].sort((a, b) =>
    String(a.nombre_comercial || a.nombre || "").localeCompare(String(b.nombre_comercial || b.nombre || ""), "es")
  );
  return { filas };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { ok: false, error: "Configuración del servidor incompleta." });
  }

  const acceso = await exigirAdmin(req, supabaseUrl, anonKey);
  if (acceso.error) return acceso.error;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (texto(body.accion, 20) !== "actualizar") {
    const lista = await listar(admin);
    if (lista.error) return json(400, { ok: false, error: lista.error });
    return json(200, { ok: true, filas: lista.filas });
  }

  const userId = texto(body.userId, 80);
  const negocioId = texto(body.negocioId, 80);
  const tipoRaw = texto(body.tipo, 20);
  const tipo = tipoRaw === "taller" || tipoRaw === "grua" || tipoRaw === "vendedor" ? tipoRaw : "";
  if (!userId || !negocioId || !tipo) {
    return json(400, { ok: false, error: "No se identificó el negocio a modificar." });
  }

  const dueño = await admin.auth.admin.getUserById(userId);
  if (dueño.error || !dueño.data.user) {
    return json(400, { ok: false, error: "No se encontró el usuario." });
  }
  if (dueño.data.user.user_metadata?.creado_por_admin !== true) {
    return json(403, { ok: false, error: "Este usuario no se creó desde esta sección." });
  }

  const nombre = texto(body.nombre, 120);
  const nombreComercial = texto(body.nombre_comercial, 120);
  const nombreFinal = nombre || nombreComercial;
  const comercialFinal = nombreComercial || nombre;
  if (nombreFinal.length < 2) {
    return json(400, { ok: false, error: "Indica el nombre del negocio (mínimo 2 caracteres)." });
  }
  const telefono = texto(body.telefono, 20).replace(/\D/g, "");
  if (telefono.length < 10 || telefono.length > 11 || !telefono.startsWith("0")) {
    return json(400, { ok: false, error: "Indica un teléfono válido (código de área + 7 dígitos)." });
  }
  const estado = texto(body.estado, 80);
  const ciudad = texto(body.ciudad, 80);
  if (!estado || !ciudad) return json(400, { ok: false, error: "Selecciona el estado y la ciudad." });
  const lat = coord(body.latitud);
  const lng = coord(body.longitud);
  if (!coordValida(lat, lng)) {
    return json(400, { ok: false, error: "Indica la ubicación en el mapa, dentro de Venezuela." });
  }
  const rif = texto(body.rif, 30).toUpperCase().replace(/\s+/g, "");
  if (!/[A-Z0-9]/.test(rif)) return json(400, { ok: false, error: "Indica el RIF." });

  const vertical = texto(body.vertical, 10) === "moto" ? "moto" : "auto";
  const password = String(body.password ?? "");
  if (password && (password.length < 6 || password.length > 72)) {
    return json(400, { ok: false, error: "La clave nueva debe tener entre 6 y 72 caracteres." });
  }

  const tabla = tipo === "taller" ? "talleres" : tipo === "grua" ? "gruas" : "tiendas";
  const patch: Record<string, unknown> = {
    nombre: nombreFinal,
    nombre_comercial: comercialFinal,
    rif,
    telefono,
    estado,
    ciudad,
    latitud: lat,
    longitud: lng,
  };
  if (tipo !== "grua") patch.vertical = vertical;
  if (tipo === "taller") {
    const permitidas = new Set(vertical === "moto" ? ESPECIALIDADES_MOTO : ESPECIALIDADES_AUTO);
    const especialidad = listaTexto(body.especialidad, permitidas);
    if (especialidad.length === 0) {
      return json(400, { ok: false, error: "Selecciona al menos una especialidad del taller." });
    }
    patch.especialidad = especialidad;
  }
  if (tipo === "grua") {
    const tipos = listaTexto(body.tipos, new Set(TIPOS_GRUA));
    if (tipos.length === 0) return json(400, { ok: false, error: "Selecciona al menos un tipo de grúa." });
    patch.tipos = tipos;
    patch.servicio_24h = body.servicio_24h === true;
    patch.auxilio_vial = body.auxilio_vial === true;
  }

  const actualizado = await admin.from(tabla).update(patch).eq("id", negocioId).eq("user_id", userId);
  if (actualizado.error) {
    const msg = actualizado.error.message || "No se pudo guardar el negocio.";
    return json(400, { ok: false, error: /duplicate|unique/i.test(msg) ? "Ese RIF ya está registrado." : msg });
  }

  if (password) {
    const clave = await admin.auth.admin.updateUserById(userId, { password });
    if (clave.error) {
      return json(400, { ok: false, error: clave.error.message || "Se guardó el negocio, pero no la clave." });
    }
  }

  return json(200, { ok: true, nombre: comercialFinal });
});
