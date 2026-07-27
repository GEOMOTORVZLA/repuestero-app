-- Admin: actualizar cualquier producto (panel Admin -> edicion completa / fotos).
-- Ejecutar en Supabase SQL Editor. Requiere public.is_admin().

DROP POLICY IF EXISTS "Admin actualiza todos los productos" ON public.productos;

CREATE POLICY "Admin actualiza todos los productos"
  ON public.productos FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON POLICY "Admin actualiza todos los productos" ON public.productos IS
  'Permite al admin editar fotos y datos de publicacion de cualquier producto desde el panel.';