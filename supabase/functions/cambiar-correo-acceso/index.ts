import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOMINIO = "acceso.geomotor";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function redirectPermitido(raw: unknown): string {
  const valor = String(raw ?? "").trim();
  if (!valor) return "https://geomotorvzla.com/";
  try {
    if (valor.startsWith("com.geomotor.app://")) return valor;
    const url = new URL(valor);
    const host = url.hostname.toLowerCase();
    if (host === "geomotorvzla.com" || host === "www.geomotorvzla.com" || host === "localhost") {
      return url.href;
    }
  } catch {
    /* usa el sitio */
  }
  return "https://geomotorvzla.com/";
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
    return json(401, { ok: false, error: "Debes iniciar sesión." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const caller = authData.user;
  if (authError || !caller?.email) {
    return json(401, { ok: false, error: "Sesión inválida. Vuelve a entrar." });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const nuevo = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo)) {
    return json(400, { ok: false, error: "Escribe un correo válido." });
  }
  if (nuevo.endsWith(`@${DOMINIO}`) || nuevo.endsWith("@interno.geomotor")) {
    return json(400, { ok: false, error: "Usa el correo real del negocio, el que sí recibe mensajes." });
  }
  if (nuevo === caller.email.toLowerCase()) {
    return json(400, { ok: false, error: "Ese ya es el correo de acceso." });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const redirectTo = redirectPermitido(body.redirectTo);
  const actual = caller.email;

  if (!actual.toLowerCase().endsWith(`@${DOMINIO}`)) {
    const cambio = await userClient.auth.updateUser({ email: nuevo }, { emailRedirectTo: redirectTo });
    if (cambio.error) {
      return json(400, { ok: false, error: cambio.error.message || "No se pudo enviar la confirmación." });
    }
    return json(200, {
      ok: true,
      mensaje: "Te enviamos un enlace a ese correo. Ábrelo para que el acceso pase a ser ese.",
    });
  }

  const linkActual = await admin.auth.admin.generateLink({
    type: "email_change_current",
    email: actual,
    newEmail: nuevo,
    options: { redirectTo },
  });
  if (linkActual.error || !linkActual.data?.properties?.action_link) {
    return json(400, {
      ok: false,
      error: linkActual.error?.message || "No se pudo preparar el cambio de correo.",
    });
  }

  try {
    const verificado = await fetch(linkActual.data.properties.action_link, { redirect: "manual" });
    if (verificado.status >= 400) {
      return json(400, { ok: false, error: "No se pudo confirmar el acceso actual." });
    }
  } catch {
    return json(400, { ok: false, error: "No se pudo confirmar el acceso actual." });
  }

  const reenvio = await fetch(`${supabaseUrl}/auth/v1/resend`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "email_change", email: actual }),
  });
  if (!reenvio.ok) {
    const detalle = await reenvio.text();
    const corto = detalle.replace(/\s+/g, " ").slice(0, 180);
    return json(400, {
      ok: false,
      error: corto || "No se pudo enviar el enlace al correo nuevo.",
    });
  }

  return json(200, {
    ok: true,
    mensaje: "Te enviamos un enlace solo a ese correo. Ábrelo y el acceso pasa a ser ese. El usuario que te entregó Geomotor deja de servir.",
  });
});
