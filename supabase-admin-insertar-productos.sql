-- Admin: insertar productos en cualquier tienda (carga masiva desde panel admin).
-- Ejecutar UNA VEZ en Supabase -> SQL Editor. Requiere public.is_admin().
-- Seguro: solo añade politica INSERT para admin; no altera datos.

DROP POLICY IF EXISTS "Admin inserta productos" ON public.productos;

CREATE POLICY "Admin inserta productos"
  ON public.productos FOR INSERT
  WITH CHECK (public.is_admin());

COMMENT ON POLICY "Admin inserta productos" ON public.productos IS
  'Permite al admin cargar productos masivos en la tienda de un vendedor desde el panel.';
