-- Columnas para manejar múltiples imágenes por producto
-- Ejecuta este script en Supabase → SQL Editor

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS imagenes_extra jsonb;

