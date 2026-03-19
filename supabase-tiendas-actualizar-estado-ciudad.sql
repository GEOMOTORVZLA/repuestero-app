-- Actualizar estado y ciudad de tiendas que no los tienen
-- Así aparecen en "Ventas de repuestos cerca de mi zona"
-- Ejecuta en Supabase → SQL Editor

ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS estado text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS ciudad text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS membresia_hasta date;

-- Vendedores 1, 2, 3 (Caracas) - asignar Distrito Capital, Caracas
UPDATE public.tiendas
SET estado = 'Distrito Capital', ciudad = 'Caracas'
WHERE nombre IN ('Vendedor 1', 'Vendedor 2', 'Vendedor 3')
  AND (estado IS NULL OR estado = '')
  AND (ciudad IS NULL OR ciudad = '');

-- Activar membresía si la política la requiere para ser visibles
UPDATE public.tiendas
SET membresia_hasta = '2026-12-31'
WHERE membresia_hasta IS NULL AND latitud IS NOT NULL AND longitud IS NOT NULL;
