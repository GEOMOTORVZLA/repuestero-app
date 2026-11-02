import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { BannerEstadoCuenta } from '../utils/estadoCuentaVendedorTaller';
import './EstadoCuentaNegocioBanner.css';

export function EstadoCuentaNegocioBanner({
  etiqueta,
  banner,
}: {
  etiqueta?: string;
  banner: BannerEstadoCuenta;
}) {
  const [sinCobro, setSinCobro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase.rpc('cobro_en_cortesia');
      if (cancelado || error) return;
      setSinCobro(data === true);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const alerta = sinCobro ? null : banner.alertaMembresia;
  const resumen = sinCobro ? null : banner.resumenMembresia;

  return (
    <div
      className={`estado-cuenta-negocio estado-cuenta-negocio--${banner.variante}`}
      role="status"
    >
      {etiqueta ? <p className="estado-cuenta-negocio-etiqueta">{etiqueta}</p> : null}
      <p className="estado-cuenta-negocio-titulo">{banner.titulo}</p>
      {alerta ? <p className="estado-cuenta-negocio-alerta">{alerta}</p> : null}
      {resumen ? <p className="estado-cuenta-negocio-resumen">{resumen}</p> : null}
    </div>
  );
}