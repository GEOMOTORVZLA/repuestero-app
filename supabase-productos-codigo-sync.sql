-- Codigo estable por tienda para sincronizar inventario sin perder fotos.
-- Ejecutar UNA VEZ en Supabase → SQL Editor.

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS codigo text;

COMMENT ON COLUMN public.productos.codigo IS
  'SKU/codigo interno del vendedor. Unico por tienda. Usado en sincronizar inventario; las fotos no se tocan al sync.';

-- Unicidad case-insensitive por tienda (ignora vacios/null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_tienda_codigo_unico
  ON public.productos (tienda_id, lower(btrim(codigo)))
  WHERE codigo IS NOT NULL AND btrim(codigo) <> '';