import { supabase } from '../supabaseClient';

export type TipoEventoContacto = 'contactar_modal' | 'whatsapp';

/** Guarda un clic de Contactar para metricas admin. No bloquea la UI. */
export function registrarEventoContacto(opts: {
  tipo: TipoEventoContacto;
  origen: string;
  productoId?: string | null;
  tiendaId?: string | null;
  tallerId?: string | null;
}): void {
  void supabase
    .rpc('registrar_evento_contacto', {
      p_tipo: opts.tipo,
      p_origen: opts.origen,
      p_producto_id: opts.productoId ?? null,
      p_tienda_id: opts.tiendaId ?? null,
      p_taller_id: opts.tallerId ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn('[eventoContactoFlujo]', error.message);
    });
}

