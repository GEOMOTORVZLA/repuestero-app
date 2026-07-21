-- Avisos de disponibilidad y OFERTA en productos.
-- Ejecutar en Supabase SQL Editor antes del deploy del front.

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS disponibilidad_aviso text NULL;

ALTER TABLE public.productos
  DROP CONSTRAINT IF EXISTS productos_disponibilidad_aviso_check;

ALTER TABLE public.productos
  ADD CONSTRAINT productos_disponibilidad_aviso_check
  CHECK (
    disponibilidad_aviso IS NULL
    OR disponibilidad_aviso IN ('unica', 'pocas', 'muchas')
  );

COMMENT ON COLUMN public.productos.disponibilidad_aviso IS
  'Aviso relativo de stock: unica | pocas | muchas. NULL = sin aviso.';

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS es_oferta boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.productos.es_oferta IS
  'Si true, la tarjeta publica muestra la etiqueta OFERTA.';