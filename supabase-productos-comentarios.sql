-- Comentarios adicionales para productos (hasta 500 caracteres)
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS comentarios text;

