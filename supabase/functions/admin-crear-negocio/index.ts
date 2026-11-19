import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOMINIO = "acceso.geomotor";
const POLITICA_VERSION = "2026-04-14";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { ok: false, error: "Configuración del servidor incompleta." });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "Debes iniciar sesión como administrador." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const caller = authData.user;
  if (authError || !caller) {
    return json(401, { ok: false, error: "Sesión inválida. Vuelve a entrar." });
  }
  if ((caller.app_metadata?.role ?? "") !== "admin") {
    return json(403, { ok: false, error: "No autorizado." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "No se pudo leer la solicitud." });
  }

  const tipoRaw = texto(body.tipo, 20);
  const tipo = tipoRaw === "taller" || tipoRaw === "grua" ? tipoRaw : tipoRaw === "vendedor" ? "vendedor" : "";
  if (!tipo) return json(400, { ok: false, error: "Elige tienda, taller o grúa." });

  const vertical = texto(body.vertical, 10) === "moto" ? "moto" : "auto";
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

  const local = texto(body.usuario, 48).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,46}$/.test(local)) {
    return json(400, { ok: false, error: "El usuario debe usar letras, números o guiones, sin espacios." });
  }
  const password = String(body.password ?? "");
  if (password.length < 6 || password.length > 72) {
    return json(400, { ok: false, error: "La clave debe tener entre 6 y 72 caracteres." });
  }

  let especialidad: string[] = [];
  let tipos: string[] = [];
  if (tipo === "taller") {
    const permitidas = new Set(vertical === "moto" ? ESPECIALIDADES_MOTO : ESPECIALIDADES_AUTO);
    especialidad = (Array.isArray(body.especialidad) ? body.especialidad : [])
      .map((x) => String(x).trim())
      .filter((x) => permitidas.has(x));
    if (especialidad.length === 0) {
      return json(400, { ok: false, error: "Selecciona al menos una especialidad del taller." });
    }
  }
  if (tipo === "grua") {
    const permitidos = new Set(TIPOS_GRUA);
    tipos = (Array.isArray(body.tipos) ? body.tipos : [])
      .map((x) => String(x).trim())
      .filter((x) => permitidos.has(x));
    if (tipos.length === 0) {
      return json(400, { ok: false, error: "Selecciona al menos un tipo de grúa." });
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let email = `${local}@${DOMINIO}`;
  let userId = "";
  for (let n = 0; n < 20; n += 1) {
    const creado = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { tipo_cuenta: tipo, creado_por_admin: true },
    });
    if (!creado.error && creado.data.user?.id) {
      userId = creado.data.user.id;
      break;
    }
    const msg = (creado.error?.message ?? "").toLowerCase();
    const ocupado = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (!ocupado) {
      return json(400, { ok: false, error: creado.error?.message || "No se pudo crear el usuario." });
    }
    email = `${local}-${n + 2}@${DOMINIO}`;
  }
  if (!userId) {
    return json(400, { ok: false, error: "Ese usuario ya existe. Elige otro." });
  }

  const politica = {
    politica_divulgacion_aceptada: true,
    politica_divulgacion_version: POLITICA_VERSION,
    politica_divulgacion_aceptada_en: new Date().toISOString(),
  };
  const comun = {
    user_id: userId,
    nombre: nombreFinal,
    nombre_comercial: comercialFinal,
    rif,
    estado,
    ciudad,
    telefono,
    latitud: lat,
    longitud: lng,
    aprobacion_estado: "aprobado",
    bloqueado: false,
    ...politica,
  };

  let tabla = "tiendas";
  let fila: Record<string, unknown> = { ...comun, vertical };
  if (tipo === "taller") {
    tabla = "talleres";
    fila = { ...comun, vertical, tipo_persona: "natural", especialidad, marca_vehiculo: "Multimarca" };
  } else if (tipo === "grua") {
    tabla = "gruas";
    fila = {
      ...comun,
      tipo_persona: "natural",
      tipos,
      servicio_24h: body.servicio_24h === true,
      auxilio_vial: body.auxilio_vial === true,
    };
  }

  let insertado = await admin.from(tabla).insert(fila);
  if (insertado.error && /politica_divulgacion/i.test(insertado.error.message)) {
    const { politica_divulgacion_aceptada, politica_divulgacion_version, politica_divulgacion_aceptada_en, ...sinPolitica } =
      fila;
    void politica_divulgacion_aceptada;
    void politica_divulgacion_version;
    void politica_divulgacion_aceptada_en;
    insertado = await admin.from(tabla).insert(sinPolitica);
  }
  if (insertado.error) {
    await admin.auth.admin.deleteUser(userId);
    const msg = insertado.error.message || "No se pudo guardar el negocio.";
    const claro = /duplicate|unique/i.test(msg) ? "Ese RIF ya está registrado." : msg;
    return json(400, { ok: false, error: claro });
  }

  return json(200, { ok: true, email, userId, nombre: comercialFinal });
});
