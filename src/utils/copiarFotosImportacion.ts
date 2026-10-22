import { supabase } from '../supabaseClient';

type RespuestaCopia = {
  ok?: boolean;
  error?: string;
  avisos?: string[];
};

function esUrlSupabase(url: string): boolean {
  return url.includes('/storage/v1/object/public/');
}

async function pool<T>(items: T[], limite: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      await fn(items[idx]);
    }
  }
  const n = Math.max(1, Math.min(limite, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
}

/** Copia enlaces externos al bucket de productos. Si falla, el producto conserva el enlace original. */
export async function copiarFotosExternasDeProductos(
  items: { rowNumber: number; productoId: string; urls: string[] }[],
  onProgreso?: (hechos: number, total: number) => void
): Promise<{ copiadas: number; fallos: string[] }> {
  const pendientes = items.filter((item) => item.urls.some((u) => u.trim() && !esUrlSupabase(u.trim())));
  const fallos: string[] = [];
  let copiadas = 0;
  let hechos = 0;

  await pool(pendientes, 3, async (item) => {
    const { data, error } = await supabase.functions.invoke<RespuestaCopia>('copiar-foto-externa', {
      body: { producto_id: item.productoId, urls: item.urls.slice(0, 4) },
    });
    hechos += 1;
    onProgreso?.(hechos, pendientes.length);
    if (error || data?.ok === false) {
      fallos.push(`Fila ${item.rowNumber}: ${data?.error || error?.message || 'no se pudo copiar la foto'}`);
      return;
    }
    const avisos = Array.isArray(data?.avisos) ? data.avisos : [];
    if (avisos.length) {
      for (const aviso of avisos) fallos.push(`Fila ${item.rowNumber}: ${aviso}`);
    }
    const externas = item.urls.filter((u) => u.trim() && !esUrlSupabase(u.trim())).length;
    copiadas += Math.max(0, externas - avisos.length);
  });

  return { copiadas, fallos };
}
