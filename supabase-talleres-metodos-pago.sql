-- Añadir métodos de pago a talleres (igual que en tiendas)
-- Ejecuta en Supabase → SQL Editor

ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS metodos_pago text[];
