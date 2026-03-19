-- Foto referencial del repuesto + contacto del vendedor para "Contactar vendedor"
-- Ejecuta en Supabase → SQL Editor

-- 1. Foto del producto (URL desde Storage o enlace externo)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS imagen_url text;

-- 2. Contacto del vendedor (tienda) para métricas de contacto
ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS telefono text;

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS email text;
