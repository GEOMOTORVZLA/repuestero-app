import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { urlImagenProductoVariante } from '../utils/imagenProducto';

type Variante = 'tarjeta' | 'miniatura' | 'vista' | 'completa';

type ImagenProductoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  url: string | null | undefined;
  variante: Variante;
};

/**
 * Muestra miniatura guardada (*-thumb.*) en listados; si 404 (foto vieja), cae al original.
 */
export function ImagenProducto({ url, variante, alt = '', onError, ...rest }: ImagenProductoProps) {
  const original = typeof url === 'string' ? url.trim() : '';
  const preferred = original ? urlImagenProductoVariante(original, variante) ?? original : '';
  const [src, setSrc] = useState(preferred);

  useEffect(() => {
    if (!original) {
      setSrc('');
      return;
    }
    setSrc(urlImagenProductoVariante(original, variante) ?? original);
  }, [original, variante]);

  if (!original || !src) return null;

  return (
    <img
      {...rest}
      alt={alt}
      src={src}
      onError={(e) => {
        if (src !== original) setSrc(original);
        onError?.(e);
      }}
    />
  );
}
