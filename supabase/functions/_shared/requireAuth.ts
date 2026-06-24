import { createClient } from "jsr:@supabase/supabase-js@2";

type RequireAuthOptions = {
  corsHeaders: Record<string, string>;
  /** Maximo de llamadas por usuario en la ventana (por instancia de la funcion). */
  maxPerHour?: number;
};

type AuthOk = { userId: string };

const DEFAULT_MAX_PER_HOUR = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const rateHits = new Map<string, { count: number; resetAt: number }>();

function jsonAuthError(
  status: number,
  error: string,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function checkRateLimit(userId: string, maxPerHour: number): string | null {
  const now = Date.now();
  const row = rateHits.get(userId);
  if (!row || now >= row.resetAt) {
    rateHits.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }
  row.count += 1;
  if (row.count > maxPerHour) {
    return "Demasiadas consultas de IA en poco tiempo. Espera unos minutos e intenta de nuevo.";
  }
  return null;
}

/** Valida JWT de usuario (no anon) y aplica rate limit basico por user_id. */
export async function requireAuthenticatedUser(
  req: Request,
  options: RequireAuthOptions
): Promise<AuthOk | Response> {
  const { corsHeaders, maxPerHour = DEFAULT_MAX_PER_HOUR } = options;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonAuthError(401, "Debes iniciar sesi\u00f3n para usar esta funci\u00f3n.", corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[requireAuth] Faltan SUPABASE_URL o SUPABASE_ANON_KEY");
    return jsonAuthError(500, "Configuraci\u00f3n del servidor incompleta.", corsHeaders);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return jsonAuthError(401, "Sesi\u00f3n inv\u00e1lida o expirada. Vuelve a iniciar sesi\u00f3n.", corsHeaders);
  }

  const rateMsg = checkRateLimit(user.id, maxPerHour);
  if (rateMsg) {
    return jsonAuthError(429, rateMsg, corsHeaders);
  }

  return { userId: user.id };
}