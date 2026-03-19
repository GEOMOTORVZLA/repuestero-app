-- Añadir estado y ciudad a tiendas para filtrar vendedores por ubicación
-- ("Repuestos cerca de mi zona"). Ejecutar en Supabase → SQL Editor.

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS estado text;

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS ciudad text;

-- Opcional: índice para búsquedas por ubicación
CREATE INDEX IF NOT EXISTS idx_tiendas_estado ON public.tiendas(estado);
CREATE INDEX IF NOT EXISTS idx_tiendas_ciudad ON public.tiendas(ciudad);
