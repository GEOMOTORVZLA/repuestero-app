/** Validación compartida para vendedores y talleres (registro, perfil, admin). */

export const VENEZUELA_LAT_MIN = 0.5;
export const VENEZUELA_LAT_MAX = 12.6;
export const VENEZUELA_LNG_MIN = -73.4;
export const VENEZUELA_LNG_MAX = -59.8;

export function parseCoordenadaRegistro(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export function esCoordenadaNegocioValida(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  if (lat < VENEZUELA_LAT_MIN || lat > VENEZUELA_LAT_MAX) return false;
  if (lng < VENEZUELA_LNG_MIN || lng > VENEZUELA_LNG_MAX) return false;
  return true;
}

/** Los 7 dígitos del teléfono (sin código de área). */
export function esRestoTelefonoValido(restoTel: string): boolean {
  return /^\d{7}$/.test(restoTel.replace(/\D/g, ''));
}

/** Teléfono guardado (código + número, típicamente 11 dígitos en VE). */
export function esTelefonoVenezuelaValido(telefono: string | null | undefined): boolean {
  const digits = String(telefono ?? '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11 && digits.startsWith('0');
}

export function esRifValido(tipoRif: string, numeroRif: string): boolean {
  const digits = numeroRif.replace(/\D/g, '');
  return Boolean(tipoRif.trim()) && digits.length >= 7 && digits.length <= 9;
}

export function esRifAlmacenadoValido(rif: string | null | undefined): boolean {
  const digits = String(rif ?? '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 9;
}

export function esNombreNegocioValido(nombreJuridico: string, nombreComercial: string): boolean {
  return nombreJuridico.trim().length >= 2 || nombreComercial.trim().length >= 2;
}

export type DatosNegocioMinimos = {
  telefono: string | null;
  estado: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  rif?: string | null;
  nombre?: string | null;
  nombre_comercial?: string | null;
};

/** Devuelve mensaje de error o null si los datos mínimos están completos. */
export function mensajeValidacionDatosNegocio(datos: DatosNegocioMinimos): string | null {
  if (!esNombreNegocioValido(datos.nombre ?? '', datos.nombre_comercial ?? '')) {
    return 'Indica el nombre jurídico o comercial del negocio (mínimo 2 caracteres).';
  }
  if (datos.rif !== undefined && !esRifAlmacenadoValido(datos.rif)) {
    return 'Indica un RIF válido (número completo).';
  }
  if (!esTelefonoVenezuelaValido(datos.telefono)) {
    return 'Indica un teléfono de empresa válido (código de área + 7 dígitos).';
  }
  if (!datos.estado?.trim()) {
    return 'Selecciona el estado.';
  }
  if (!datos.ciudad?.trim()) {
    return 'Selecciona la ciudad o municipio.';
  }
  if (!esCoordenadaNegocioValida(datos.latitud, datos.longitud)) {
    return 'Indica la ubicación en el mapa o con GPS (coordenadas válidas en Venezuela; no se acepta 0,0).';
  }
  return null;
}

export function perfilVendedorMetadataListo(
  perfil: Record<string, unknown> | null | undefined
): boolean {
  if (!perfil || typeof perfil !== 'object') return false;
  const lat = parseCoordenadaRegistro(perfil.latitud);
  const lng = parseCoordenadaRegistro(perfil.longitud);
  return (
    mensajeValidacionDatosNegocio({
      nombre: perfil.nombre != null ? String(perfil.nombre) : null,
      nombre_comercial: perfil.nombre_comercial != null ? String(perfil.nombre_comercial) : null,
      rif: perfil.rif != null ? String(perfil.rif) : null,
      telefono: perfil.telefono != null ? String(perfil.telefono) : null,
      estado: perfil.estado != null ? String(perfil.estado) : null,
      ciudad: perfil.ciudad != null ? String(perfil.ciudad) : null,
      latitud: lat,
      longitud: lng,
    }) === null
  );
}

export function perfilTallerMetadataListo(
  perfil: Record<string, unknown> | null | undefined
): boolean {
  if (!perfilVendedorMetadataListo(perfil)) return false;
  const esp = perfil?.especialidad;
  if (Array.isArray(esp)) return esp.some((x) => typeof x === 'string' && x.trim());
  if (typeof esp === 'string' && esp.trim()) return true;
  return false;
}

export type NegocioAdminAprobacion = {
  nombre?: string | null;
  nombre_comercial?: string | null;
  rif?: string | null;
  telefono?: string | null;
  estado?: string | null;
  ciudad?: string | null;
  latitud?: number | null;
  longitud?: number | null;
};

export function mensajeNegocioNoListoParaAprobar(negocio: NegocioAdminAprobacion): string | null {
  const lat = parseCoordenadaRegistro(negocio.latitud);
  const lng = parseCoordenadaRegistro(negocio.longitud);
  return mensajeValidacionDatosNegocio({
    nombre: negocio.nombre ?? null,
    nombre_comercial: negocio.nombre_comercial ?? null,
    rif: negocio.rif ?? null,
    telefono: negocio.telefono ?? null,
    estado: negocio.estado ?? null,
    ciudad: negocio.ciudad ?? null,
    latitud: lat,
    longitud: lng,
  });
}
