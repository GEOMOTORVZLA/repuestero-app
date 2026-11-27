import type { ReactNode } from 'react';
import './ConteoListado.css';

/** Cuántos van abiertos y cuántos hay en la búsqueda. El total llega aparte de la página. */
export function ConteoListado({
  mostrados,
  total,
  children,
}: {
  mostrados: number;
  total: number | null;
  children?: ReactNode;
}) {
  const conocido = total != null && total >= mostrados && mostrados > 0;
  if (!children && !conocido) return null;

  return (
    <div className="conteo-listado">
      {children}
      {conocido && (
        <p className="conteo-listado-cifra" aria-live="polite">
          <span className="conteo-listado-num">{mostrados.toLocaleString('es-VE')}</span>
          <span className="conteo-listado-de">de</span>
          <span className="conteo-listado-num">{total.toLocaleString('es-VE')}</span>
        </p>
      )}
    </div>
  );
}

export function totalDeConteo(count: number | null | undefined): number | null {
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
}
