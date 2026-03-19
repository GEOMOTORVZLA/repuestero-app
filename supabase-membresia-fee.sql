-- Membresía / fee al día: solo aparecen en mapa y búsquedas si membresia_hasta >= hoy
-- Ejecuta en Supabase → SQL Editor

-- 1. Añadir membresia_hasta a talleres
ALTER TABLE public.talleres
  ADD COLUMN IF NOT EXISTS membresia_hasta date;

-- 2. Añadir membresia_hasta a tiendas
ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS membresia_hasta date;

-- 3. Talleres: el dueño siempre ve el suyo; el público solo ve los que tienen membresía activa
DROP POLICY IF EXISTS "Permitir leer talleres" ON public.talleres;
CREATE POLICY "Permitir leer talleres"
  ON public.talleres FOR SELECT
  USING (
    auth.uid() = user_id
    OR (membresia_hasta IS NOT NULL AND membresia_hasta >= current_date)
  );

-- 4. Tiendas: el dueño siempre ve la suya; el público solo ve las que tienen membresía activa
CREATE POLICY "Publico ve tiendas con membresia activa"
  ON public.tiendas FOR SELECT
  USING (membresia_hasta IS NOT NULL AND membresia_hasta >= current_date);
