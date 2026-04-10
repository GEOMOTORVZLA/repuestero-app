import type { BannerEstadoCuenta } from '../utils/estadoCuentaVendedorTaller';
import './EstadoCuentaNegocioBanner.css';

export function EstadoCuentaNegocioBanner({
  etiqueta,
  banner,
}: {
  etiqueta?: string;
  banner: BannerEstadoCuenta;
}) {
  return (
    <div
      className={`estado-cuenta-negocio estado-cuenta-negocio--${banner.variante}`}
      role="status"
    >
      {etiqueta ? <p className="estado-cuenta-negocio-etiqueta">{etiqueta}</p> : null}
      <p className="estado-cuenta-negocio-titulo">{banner.titulo}</p>
      {banner.alertaMembresia ? (
        <p className="estado-cuenta-negocio-alerta">{banner.alertaMembresia}</p>
      ) : null}
      {banner.resumenMembresia ? (
        <p className="estado-cuenta-negocio-resumen">{banner.resumenMembresia}</p>
      ) : null}
    </div>
  );
}