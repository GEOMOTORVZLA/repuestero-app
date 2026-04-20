type RateLimitOptions = {
  maxIntentos: number;
  ventanaMs: number;
  bloqueoMs?: number;
};

type RateLimitState = {
  marcas: number[];
  bloqueadoHasta?: number;
};

const PREFIJO = 'geomotor:rl:';

function leerEstado(clave: string): RateLimitState {
  try {
    const raw = localStorage.getItem(PREFIJO + clave);
    if (!raw) return { marcas: [] };
    const parsed = JSON.parse(raw) as RateLimitState;
    return {
      marcas: Array.isArray(parsed.marcas) ? parsed.marcas.filter((n) => Number.isFinite(n)) : [],
      bloqueadoHasta: Number.isFinite(parsed.bloqueadoHasta) ? parsed.bloqueadoHasta : undefined,
    };
  } catch {
    return { marcas: [] };
  }
}

function guardarEstado(clave: string, estado: RateLimitState): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(estado));
  } catch {
    // ignore
  }
}

function formatearSegundos(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return `${m} min`;
}

/**
 * Limitador simple por navegador/cliente para bajar abuso basico.
 * No reemplaza WAF/rate-limit server-side.
 */
export function permitirAccionCliente(
  clave: string,
  { maxIntentos, ventanaMs, bloqueoMs = 0 }: RateLimitOptions
): { ok: true } | { ok: false; mensaje: string } {
  const ahora = Date.now();
  const estado = leerEstado(clave);

  if (estado.bloqueadoHasta && ahora < estado.bloqueadoHasta) {
    return {
      ok: false,
      mensaje: `Demasiados intentos. Intenta de nuevo en ${formatearSegundos(
        estado.bloqueadoHasta - ahora
      )}.`,
    };
  }

  const desde = ahora - ventanaMs;
  const marcasVigentes = estado.marcas.filter((t) => t >= desde);
  if (marcasVigentes.length >= maxIntentos) {
    const bloqueadoHasta = bloqueoMs > 0 ? ahora + bloqueoMs : undefined;
    guardarEstado(clave, { marcas: marcasVigentes, bloqueadoHasta });
    return {
      ok: false,
      mensaje: bloqueoMs
        ? `Demasiados intentos. Intenta de nuevo en ${formatearSegundos(bloqueoMs)}.`
        : 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    };
  }

  marcasVigentes.push(ahora);
  guardarEstado(clave, { marcas: marcasVigentes });
  return { ok: true };
}
