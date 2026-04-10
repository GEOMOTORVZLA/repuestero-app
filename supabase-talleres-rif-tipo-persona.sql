-- Opcional: datos del formulario de registro de taller que faltaban en la tabla.
-- Ejecuta en Supabase → SQL Editor si quieres RIF y tipo de persona en `talleres`.

ALTER TABLE public.talleres ADD COLUMN IF NOT EXISTS rif text;
ALTER TABLE public.talleres ADD COLUMN IF NOT EXISTS tipo_persona text;

COMMENT ON COLUMN public.talleres.rif IS 'RIF indicado en el registro (natural o jurídico).';
COMMENT ON COLUMN public.talleres.tipo_persona IS 'natural | jurídico según el registro.';
