import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  esUsuarioAdmin,
  getTipoPanelNegocio,
  type TipoPanelNegocio,
} from '../utils/cuentaTipo';

export type DashboardPanelTipo = 'loading' | 'admin' | 'comprador' | 'vendedor' | 'taller';

/**
 * Comprador vs vendedor vs taller: metadata primero; si es ambiguo, filas en tiendas/talleres.
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
      const { data: authData } = await supabase.auth.getUser();
      const u = authData?.user ?? user;

      if (esUsuarioAdmin(u)) {
        if (!cancelled) setTipo('admin');
        return;
      }

      const desdeMeta = getTipoPanelNegocio(u);
      if (desdeMeta !== 'comprador') {
        if (!cancelled) setTipo(desdeMeta);
        return;
      }

      const { data: tiendas } = await supabase.from('tiendas').select('id').eq('user_id', u.id).limit(1);
      if (!cancelled && tiendas?.length) {
        setTipo('vendedor');
        return;
      }

      const { data: talleres } = await supabase.from('talleres').select('id').eq('user_id', u.id).limit(1);
      if (!cancelled && talleres?.length) {
        setTipo('taller');
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

export type { TipoPanelNegocio };
