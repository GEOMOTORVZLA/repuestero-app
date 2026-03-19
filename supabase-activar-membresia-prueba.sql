-- Activar membresía para todos los talleres y tiendas que tengan ubicación
-- Así aparecen en el mapa y en las búsquedas. Ejecuta en Supabase → SQL Editor.

UPDATE public.talleres
SET membresia_hasta = '2026-12-31'
WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

UPDATE public.tiendas
SET membresia_hasta = '2026-12-31'
WHERE latitud IS NOT NULL AND longitud IS NOT NULL;
