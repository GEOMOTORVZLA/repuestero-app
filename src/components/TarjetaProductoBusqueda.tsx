import { useEffect, useMemo, useState } from 'react';
import { urlImagenProductoVariante } from '../utils/imagenProducto';
import { urlsFotosProducto } from '../utils/productoImagenesExtra';
import './BusquedaRepuestos.css';

/** Producto mínimo para listados de búsqueda / categoría */
export interface ProductoTarjetaBusqueda {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_usd: number;
  moneda: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  imagen_url: string | null;
  imagenes_extra?: string[] | null;
}

function fotoPrincipalTarjeta(p: ProductoTarjetaBusqueda): string | null {
  const fotos = urlsFotosProducto(p);
  return fotos[0] ?? null;
}

export interface TarjetaProductoBusquedaProps<T extends ProductoTarjetaBusqueda = ProductoTarjetaBusqueda> {
  producto: T;
  expandida: boolean;
  onExpand: () => void;
  onContraer: () => void;
  onContactar: (p: T) => void;
}

export function TarjetaProductoBusqueda<T extends ProductoTarjetaBusqueda>({
  producto: p,
  expandida,
  onExpand,
  onContraer,
  onContactar,
}: TarjetaProductoBusquedaProps<T>) {
  const fotos = useMemo(() => urlsFotosProducto(p), [p.id, p.imagen_url, p.imagenes_extra]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(fotos[0] ?? null);

  useEffect(() => {
    if (expandida) {
      setPreviewUrl(fotos[0] ?? null);
    }
  }, [expandida, fotos]);

  const thumb = fotoPrincipalTarjeta(p);

  const bloqueInfo = (
    <div className="busqueda-repuestos-card-info">
      <h4 className="busqueda-repuestos-card-nombre">{p.nombre}</h4>
      {(p.marca || p.modelo || p.anio) && (
        <p className="busqueda-repuestos-card-vehiculo">
          {[p.marca, p.modelo, p.anio].filter(Boolean).join(' · ')}
        </p>
      )}
      {p.descripcion && <p className="busqueda-repuestos-card-desc">{p.descripcion}</p>}
      <p className="busqueda-repuestos-card-precio">
        {p.moneda === 'BS' ? 'Bs' : 'USD'} {Number(p.precio_usd).toLocaleString()}
      </p>
    </div>
  );

  return (
    <article
      className={`busqueda-repuestos-card ${expandida ? 'busqueda-repuestos-card--expandida' : ''}`}
      data-producto-id={p.id}
    >
      {!expandida ? (
        <button
          type="button"
          className="busqueda-repuestos-card-resumen"
          onClick={onExpand}
          aria-expanded={false}
        >
          <div className="busqueda-repuestos-card-foto">
            {thumb ? (
              <img
                src={urlImagenProductoVariante(thumb, 'tarjeta') ?? thumb}
                alt=""
                width={400}
                height={400}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                sizes="(max-width: 640px) 88px, 200px"
              />
            ) : (
              <div className="busqueda-repuestos-card-foto-placeholder">Sin foto</div>
            )}
          </div>
          <div className="busqueda-repuestos-card-cuerpo busqueda-repuestos-card-cuerpo--solo-info">
            {bloqueInfo}
          </div>
        </button>
      ) : (
        <>
          <div className="busqueda-repuestos-card-cabecera-expandida">
            <div className="busqueda-repuestos-card-foto busqueda-repuestos-card-foto--mini">
              {thumb ? (
                <img
                  src={urlImagenProductoVariante(thumb, 'miniatura') ?? thumb}
                  alt=""
                  width={160}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  sizes="80px"
                />
              ) : (
                <div className="busqueda-repuestos-card-foto-placeholder">Sin foto</div>
              )}
            </div>
            <div className="busqueda-repuestos-card-cabecera-expandida-texto">
              <h4 className="busqueda-repuestos-card-nombre busqueda-repuestos-card-nombre--compacto">
                {p.nombre}
              </h4>
              <p className="busqueda-repuestos-card-precio busqueda-repuestos-card-precio--inline">
                {p.moneda === 'BS' ? 'Bs' : 'USD'} {Number(p.precio_usd).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              className="busqueda-repuestos-card-contraer"
              onClick={onContraer}
              aria-expanded
            >
              Contraer
            </button>
          </div>

          <div className="busqueda-repuestos-card-panel-fotos" role="region" aria-label="Galería del producto">
            <h5 className="busqueda-repuestos-card-panel-titulo">Fotos del producto</h5>
            <div
              className={`busqueda-repuestos-card-galeria${fotos.length === 0 ? ' busqueda-repuestos-card-galeria--sin-miniaturas' : ''}`}
            >
              <div className="busqueda-repuestos-card-galeria-vista">
                {previewUrl ? (
                  <img
                    src={urlImagenProductoVariante(previewUrl, 'vista') ?? previewUrl}
                    alt={`Vista ampliada de ${p.nombre}`}
                    width={1080}
                    height={1080}
                    loading="lazy"
                    decoding="async"
                    sizes="(max-width: 900px) 92vw, 720px"
                  />
                ) : (
                  <div className="busqueda-repuestos-card-foto-placeholder busqueda-repuestos-card-galeria-placeholder">
                    Sin fotos registradas
                  </div>
                )}
              </div>
              <div className="busqueda-repuestos-card-galeria-descripcion">
                <p className="busqueda-repuestos-card-galeria-desc-titulo">Descripción del artículo</p>
                {(p.marca || p.modelo || p.anio) && (
                  <p className="busqueda-repuestos-card-vehiculo busqueda-repuestos-card-galeria-desc-vehiculo">
                    {[p.marca, p.modelo, p.anio].filter(Boolean).join(' · ')}
                  </p>
                )}
                {p.descripcion ? (
                  <p className="busqueda-repuestos-card-desc busqueda-repuestos-card-desc--panel">{p.descripcion}</p>
                ) : (
                  <p className="busqueda-repuestos-card-galeria-sin-desc">Sin descripción registrada.</p>
                )}
              </div>
              {fotos.length > 0 ? (
                <ul className="busqueda-repuestos-card-galeria-miniaturas">
                  {fotos.map((url, i) => (
                    <li key={`${p.id}-foto-${i}`}>
                      <button
                        type="button"
                        className={`busqueda-repuestos-card-miniatura ${previewUrl === url ? 'activa' : ''}`}
                        onMouseEnter={() => setPreviewUrl(url)}
                        onFocus={() => setPreviewUrl(url)}
                        onClick={() => setPreviewUrl(url)}
                        aria-label={`Foto ${i + 1} de ${fotos.length}`}
                      >
                        <img
                          src={urlImagenProductoVariante(url, 'miniatura') ?? url}
                          alt=""
                          width={160}
                          height={160}
                          loading="lazy"
                          decoding="async"
                          sizes="72px"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {fotos.length > 0 && (
              <p className="busqueda-repuestos-card-galeria-hint">
                Pasa el cursor sobre cada miniatura para verla ampliada. En móvil, pulsa una miniatura.
              </p>
            )}
            <div className="busqueda-repuestos-card-botones busqueda-repuestos-card-botones--panel">
              <button
                type="button"
                className="busqueda-repuestos-card-btn"
                onClick={() => onContactar(p)}
              >
                Contactar vendedor
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
