-- Vertical de producto: automóvil vs moto (landing y búsquedas separadas).
-- Ejecutar en Supabase → SQL Editor después de desplegar el front.

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'auto';

ALTER TABLE public.productos
  ADD CONSTRAINT productos_vertical_check
  CHECK (vertical IN ('auto', 'moto'));

COMMENT ON COLUMN public.productos.vertical IS 'auto = repuestos carros; moto = repuestos motos (landings y consultas filtradas).';

CREATE INDEX IF NOT EXISTS idx_productos_vertical ON public.productos (vertical);
CREATE INDEX IF NOT EXISTS idx_productos_vertical_activo ON public.productos (vertical, activo);

-- Datos existentes: todo el catálogo previo es automóvil
UPDATE public.productos SET vertical = 'auto' WHERE vertical IS NULL OR vertical = '';
