-- Paso 3 seguridad: politicas Storage bucket "productos"
-- Ejecutar una vez en Supabase -> SQL Editor (proyecto produccion).
--
-- Rutas usadas por la app:
--   {producto_id}/principal.{ext} | extra-N.{ext}
--   fotos-masivas-vendedor/{user_id}/{lote}/foto-N.{ext}
--   admin-fotos-masivas/{tienda_id}/{lote}/foto-N.{ext}
--
-- Si el bucket ya tenia politicas abiertas creadas en el Dashboard, este script
-- las reemplaza por nombres controlados (productos_*). Revisa Storage -> Policies.

-- 1) Bucket publico (lectura por URL publica en catalogo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.usuario_es_dueno_producto_storage(p_producto_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.productos pr
    JOIN public.tiendas t ON t.id = pr.tienda_id
    WHERE pr.id = p_producto_id
      AND t.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.storage_productos_puede_escribir(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  parts text[];
  pid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  parts := storage.foldername(object_name);

  IF array_length(parts, 1) >= 2 AND parts[1] = 'fotos-masivas-vendedor' THEN
    RETURN parts[2] = auth.uid()::text;
  END IF;

  IF array_length(parts, 1) >= 1 AND parts[1] = 'admin-fotos-masivas' THEN
    RETURN false;
  END IF;

  BEGIN
    pid := parts[1]::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
    WHEN OTHERS THEN
      RETURN false;
  END;

  RETURN public.usuario_es_dueno_producto_storage(pid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.usuario_es_dueno_producto_storage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_productos_puede_escribir(text) TO authenticated;

-- 3) Quitar politicas previas del bucket (nombres conocidos / anteriores)
DROP POLICY IF EXISTS "productos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "productos_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "productos_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "productos_authenticated_delete" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1oj01fe_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1oj01fe_1" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1oj01fe_2" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder 1oj01fe_3" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete" ON storage.objects;

-- 4) Politicas nuevas
CREATE POLICY "productos_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'productos');

CREATE POLICY "productos_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'productos'
    AND public.storage_productos_puede_escribir(name)
  );

CREATE POLICY "productos_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'productos'
    AND public.storage_productos_puede_escribir(name)
  )
  WITH CHECK (
    bucket_id = 'productos'
    AND public.storage_productos_puede_escribir(name)
  );

CREATE POLICY "productos_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'productos'
    AND public.storage_productos_puede_escribir(name)
  );