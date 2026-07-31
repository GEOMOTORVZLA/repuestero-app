import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { esPlataformaNativaCapacitor, pathDesdeUrlAppLink } from '../utils/deepLinkNativo';

/**
 * En Android/iOS: si la app se abre por App Link (https://geomotorvzla.com/...?tienda=),
 * navega el Router al path+query. OAuth (com.geomotor.app://) lo sigue manejando AuthContext.
 */
export function DeepLinkNativoBridge() {
  const navigate = useNavigate();
  const ultimaUrlAplicadaRef = useRef<string | null>(null);

  useEffect(() => {
    if (!esPlataformaNativaCapacitor()) return;

    const aplicar = (url: string) => {
      const destino = pathDesdeUrlAppLink(url);
      if (!destino) return;
      if (ultimaUrlAplicadaRef.current === url) return;
      ultimaUrlAplicadaRef.current = url;
      navigate(destino, { replace: true });
    };

    void CapacitorApp.getLaunchUrl()
      .then((resultado) => {
        if (resultado?.url) aplicar(resultado.url);
      })
      .catch(() => undefined);

    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      aplicar(url);
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [navigate]);

  return null;
}