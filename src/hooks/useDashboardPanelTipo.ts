import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { esUsuarioAdmin, getTipoPanelUsuario } from '../utils/cuentaTipo';

export type DashboardPanelTipo = 'loading' | 'admin' | 'comprador' | 'vendedor_taller';

/**
 * Comprador vs vendedor/taller: metadata primero; si es ambiguo, filas en tiendas/talleres (cuentas antiguas).
 */
export function useDashboardPanelTipo(user: User | null | undefined): DashboardPanelTipo {
  const [tipo, setTipo] = useState<DashboardPanelTipo>('loading');

  useEffect(() => {
    if (!user) {
      setTipo('comprador');
      return;
    }

    let cancelled = false;

    const run = async () => {
      /**
       * Si cambias app_metadata (rol admin) en Supabase, el JWT puede estar cacheado:
       * getUser() trae metadata actualizada desde el servidor.
       */
      const { data: authData } = await supabase.auth.getUser();
      const u = authData?.user ?? user;

      if (esUsuarioAdmin(u)) {
        if (!cancelled) setTipo('admin');
        return;
      }

      const desdeMeta = getTipoPanelUsuario(u);
      if (desdeMeta === 'vendedor_taller') {
        if (!cancelled) setTipo('vendedor_taller');
        return;
      }

      const { data: tiendas } = await supabase.from('tiendas').select('id').eq('user_id', u.id).limit(1);
      if (!cancelled && tiendas?.length) {
        setTipo('vendedor_taller');
        return;
      }

      const { data: talleres } = await supabase.from('talleres').select('id').eq('user_id', u.id).limit(1);
      if (!cancelled && talleres?.length) {
        setTipo('vendedor_taller');
        return;
      }

      if (!cancelled) setTipo('comprador');
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user]);

  return tipo;
}
