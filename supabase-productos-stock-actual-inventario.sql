-- Inventario opcional por producto (existencia).
-- NULL = el vendedor no controla cantidad (comportamiento actual / visible si activo).
-- 0 = agotado: no debe mostrarse al publico (la app tambien pone activo=false).
-- >0 = unidades disponibles; la app sincroniza disponibilidad_aviso.
--
-- Ejecutar en Supabase → SQL Editor ANTES de desplegar el front que usa estas reglas.

ALTER TABLE public.productos
  ALTER COLUMN stock_actual DROP NOT NULL;

-- Los inserts historicos ponian stock_actual=0 sin significado de inventario.
UPDATE public.productos
SET stock_actual = NULL
WHERE stock_actual IS NOT DISTINCT FROM 0;

COMMENT ON COLUMN public.productos.stock_actual IS
  'Existencia opcional. NULL=sin control; 0=agotado (oculto/pausado); >0=unidades.';

CREATE INDEX IF NOT EXISTS idx_productos_stock_actual_publico
  ON public.productos (activo, stock_actual)
  WHERE coalesce(activo, true) = true;
