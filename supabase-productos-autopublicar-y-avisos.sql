-- Autopublicar productos + aviso al vendedor si admin elimina por normas
-- Ejecutar UNA VEZ en Supabase SQL Editor.

ALTER TABLE public.productos ALTER COLUMN aprobacion_publica SET DEFAULT 'aprobado';

CREATE OR REPLACE FUNCTION public.trg_productos_aprobacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_publica := 'aprobado';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_publica := OLD.aprobacion_publica;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS productos_aprobacion_guard ON public.productos;
CREATE TRIGGER productos_aprobacion_guard
  BEFORE INSERT OR UPDATE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.trg_productos_aprobacion();

UPDATE public.productos
SET aprobacion_publica = 'aprobado'
WHERE coalesce(aprobacion_publica, 'pendiente') = 'pendiente';

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS aviso_normas_productos_eliminados integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.admin_eliminar_productos(
  p_producto_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  n int := 0;
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users me
    WHERE me.id = auth.uid()
      AND coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_producto_ids IS NULL OR coalesce(cardinality(p_producto_ids), 0) = 0 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT tienda_id, count(*)::int AS cnt
    FROM public.productos
    WHERE id = ANY (p_producto_ids)
      AND tienda_id IS NOT NULL
    GROUP BY tienda_id
  LOOP
    UPDATE public.tiendas
    SET aviso_normas_productos_eliminados =
      coalesce(aviso_normas_productos_eliminados, 0) + r.cnt
    WHERE id = r.tienda_id;
  END LOOP;

  DELETE FROM public.productos
  WHERE id = ANY (p_producto_ids);

  GET DIAGNOSTICS n = row_count;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_eliminar_productos(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendedor_cerrar_aviso_normas_productos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.tiendas
  SET aviso_normas_productos_eliminados = 0
  WHERE user_id = auth.uid()
    AND coalesce(aviso_normas_productos_eliminados, 0) > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendedor_cerrar_aviso_normas_productos() TO authenticated;

NOTIFY pgrst, 'reload schema';