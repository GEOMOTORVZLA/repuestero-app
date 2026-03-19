-- Marca de vehículos que atiende el taller (Multimarca o una marca) + reseña "Acerca de nosotros"
-- Ejecuta en Supabase → SQL Editor

ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS marca_vehiculo text;

ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS acerca_de text;
