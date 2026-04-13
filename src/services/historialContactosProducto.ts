import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getTipoPanelUsuario } from '../utils/cuentaTipo';
import { esMonedaBolivar, etiquetaMoneda } from '../utils/monedaProducto';

const MAX_CONTACTOS = 5;

/** Solo compradores (no vendedores/talleres, incl. cuentas antiguas con tienda/taller en BD). */
export async function usuarioDebeRegistrarHistorialContactos(
  supabase: SupabaseClient,
  user: User
): Promise<boolean> {
  if (getTipoPanelUsuario(user) === 'vendedor_taller') return false;
  const { data: tiendas } = await supabase.from('tiendas').select('id').eq('user_id', user.id).limit(1);
  if (tiendas?.length) return false;
  const { data: talleres } = await supabase.from('talleres').select('id').eq('user_id', user.id).limit(1);
  if (talleres?.length) return false;
  return true;
}

export type FilaHistorialContacto = {
  id: string;
  producto_id: string | null;
  producto_nombre: string | null;
  tienda_nombre: string | null;
  precio_texto: string | null;
  moneda: string | null;
  contactado_en: string;
};

type ProductoParaHistorial = {
  id: string;
  nombre: string;
  precio_usd: number;
  moneda: string | null;
};

/**
 * Registra un contacto al abrir el modal "Contactar vendedor" y mantiene solo los últimos MAX_CONTACTOS.
 */
export async function registrarContactoProducto(
  supabase: SupabaseClient,
  userId: string,
  producto: ProductoParaHistorial,
  tiendaNombre: string
): Promise<{ error: string | null }> {
  const simbolo = etiquetaMoneda(producto.moneda);
  const precio_texto = `${simbolo} ${Number(producto.precio_usd).toLocaleString()}`;
  const monedaNorm = esMonedaBolivar(producto.moneda) ? 'BS' : 'USD';

  const { error: insErr } = await supabase.from('historial_contactos_producto').insert({
    user_id: userId,
    producto_id: producto.id,
    producto_nombre: producto.nombre,
    tienda_nombre: tiendaNombre,
    precio_texto,
    moneda: monedaNorm,
  });

  if (insErr) {
    return { error: insErr.message || 'No se pudo guardar el contacto en el historial.' };
  }

  const { data: rows, error: selErr } = await supabase
    .from('historial_contactos_producto')
    .select('id')
    .eq('user_id', userId)
    .order('contactado_en', { ascending: false });

  if (selErr || !rows?.length) return { error: null };

  if (rows.length > MAX_CONTACTOS) {
    const sobran = rows.slice(MAX_CONTACTOS).map((r) => r.id as string);
    await supabase.from('historial_contactos_producto').delete().in('id', sobran);
  }

  return { error: null };
}

export async function fetchHistorialContactos(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: FilaHistorialContacto[]; error: string | null }> {
  const { data, error } = await supabase
    .from('historial_contactos_producto')
    .select('id, producto_id, producto_nombre, tienda_nombre, precio_texto, moneda, contactado_en')
    .eq('user_id', userId)
    .order('contactado_en', { ascending: false })
    .limit(MAX_CONTACTOS);

  if (error) {
    return { data: [], error: error.message };
  }
  return { data: (data ?? []) as FilaHistorialContacto[], error: null };
}
