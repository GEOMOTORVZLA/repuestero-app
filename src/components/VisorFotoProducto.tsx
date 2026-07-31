import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { urlImagenProductoVariante } from '../utils/imagenProducto';
import './VisorFotoProducto.css';

type VisorFotoProductoProps = {
  fotos: string[];
  indiceInicial: number;
  alt: string;
  onCerrar: () => void;
};

/**
 * Visor a pantalla completa: carga la variante grande solo al abrir.
 * Se monta en document.body (portal) para tapar buscadores/modales del panel
 * y no quedar debajo de barras sticky por stacking context.
 * Compatible con el boton atras de Android (role="dialog" + boton Cerrar).
 */
export function VisorFotoProducto({ fotos, indiceInicial, alt, onCerrar }: VisorFotoProductoProps) {
  const [indice, setIndice] = useState(() =>
    Math.min(Math.max(0, indiceInicial), Math.max(0, fotos.length - 1))
  );

  useEffect(() => {
    setIndice(Math.min(Math.max(0, indiceInicial), Math.max(0, fotos.length - 1)));
  }, [indiceInicial, fotos.length]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCerrar();
        return;
      }
      if (fotos.length < 2) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIndice((i) => (i <= 0 ? fotos.length - 1 : i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIndice((i) => (i >= fotos.length - 1 ? 0 : i + 1));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fotos.length, onCerrar]);

  if (fotos.length === 0) return null;
  if (typeof document === 'undefined') return null;

  const url = fotos[indice] ?? fotos[0];
  const srcGrande = urlImagenProductoVariante(url, 'vista') ?? url;
  const hayVarias = fotos.length > 1;

  return createPortal(
    <div
      className="visor-foto-producto"
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada del producto"
      onClick={onCerrar}
    >
      <div className="visor-foto-producto-panel" onClick={(e) => e.stopPropagation()}>
        <div className="visor-foto-producto-barra">
          {hayVarias ? (
            <span className="visor-foto-producto-contador">
              {indice + 1} / {fotos.length}
            </span>
          ) : (
            <span className="visor-foto-producto-contador" />
          )}
          <button type="button" className="visor-foto-producto-cerrar" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        <div className="visor-foto-producto-escena">
          {hayVarias && (
            <button
              type="button"
              className="visor-foto-producto-nav visor-foto-producto-nav--prev"
              aria-label="Foto anterior"
              onClick={() => setIndice((i) => (i <= 0 ? fotos.length - 1 : i - 1))}
            >
              {'‹'}
            </button>
          )}
          <img
            className="visor-foto-producto-img"
            src={srcGrande}
            alt={alt}
            width={1600}
            height={1600}
            decoding="async"
            loading="eager"
          />
          {hayVarias && (
            <button
              type="button"
              className="visor-foto-producto-nav visor-foto-producto-nav--next"
              aria-label="Foto siguiente"
              onClick={() => setIndice((i) => (i >= fotos.length - 1 ? 0 : i + 1))}
            >
              {'›'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}