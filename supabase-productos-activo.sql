-- Estado de publicación del producto (pausar/activar)
-- Ejecuta en Supabase -> SQL Editor

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- Índice opcional para búsquedas públicas
CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos(activo);

