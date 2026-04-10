-- Aprobación de vendedores, talleres y publicaciones de productos (moderación antes de mostrar en la web)
-- Ejecutar en Supabase → SQL Editor después de los scripts de tablas/políticas previos.
--
-- Valores: 'pendiente' | 'aprobado' | 'rechazado'
-- Los datos existentes pasan a 'aprobado' para no cortar el servicio actual.

-- 1) Columnas (idempotente: filas existentes → aprobado; filas nuevas → pendiente por defecto)
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS aprobacion_estado text;
UPDATE public.tiendas SET aprobacion_estado = 'aprobado' WHERE aprobacion_estado IS NULL;
ALTER TABLE public.tiendas ALTER COLUMN aprobacion_estado SET DEFAULT 'pendiente';
ALTER TABLE public.tiendas ALTER COLUMN aprobacion_estado SET NOT NULL;

ALTER TABLE public.talleres ADD COLUMN IF NOT EXISTS aprobacion_estado text;
UPDATE public.talleres SET aprobacion_estado = 'aprobado' WHERE aprobacion_estado IS NULL;
ALTER TABLE public.talleres ALTER COLUMN aprobacion_estado SET DEFAULT 'pendiente';
ALTER TABLE public.talleres ALTER COLUMN aprobacion_estado SET NOT NULL;

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS aprobacion_publica text;
UPDATE public.productos SET aprobacion_publica = 'aprobado' WHERE aprobacion_publica IS NULL;
ALTER TABLE public.productos ALTER COLUMN aprobacion_publica SET DEFAULT 'pendiente';
ALTER TABLE public.productos ALTER COLUMN aprobacion_publica SET NOT NULL;

-- 3) Restringir valores (opcional pero claro)
ALTER TABLE public.tiendas DROP CONSTRAINT IF EXISTS tiendas_aprobacion_estado_check;
ALTER TABLE public.tiendas ADD CONSTRAINT tiendas_aprobacion_estado_check
  CHECK (aprobacion_estado IN ('pendiente', 'aprobado', 'rechazado'));

ALTER TABLE public.talleres DROP CONSTRAINT IF EXISTS talleres_aprobacion_estado_check;
ALTER TABLE public.talleres ADD CONSTRAINT talleres_aprobacion_estado_check
  CHECK (aprobacion_estado IN ('pendiente', 'aprobado', 'rechazado'));

ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_aprobacion_publica_check;
ALTER TABLE public.productos ADD CONSTRAINT productos_aprobacion_publica_check
  CHECK (aprobacion_publica IN ('pendiente', 'aprobado', 'rechazado'));

-- 4) ¿Es el usuario actual administrador? (solo app_metadata / raw_app_meta_data)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $func$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = auth.uid()
      AND coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
  );
END;
$func$
LANGUAGE plpgsql;

-- 5) Triggers: solo admin puede cambiar campos de aprobación; inserts de no-admin → pendiente
CREATE OR REPLACE FUNCTION public.trg_tiendas_aprobacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_estado := 'pendiente';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_estado := OLD.aprobacion_estado;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tiendas_aprobacion_guard ON public.tiendas;
CREATE TRIGGER tiendas_aprobacion_guard
  BEFORE INSERT OR UPDATE ON public.tiendas
  FOR EACH ROW EXECUTE FUNCTION public.trg_tiendas_aprobacion();

CREATE OR REPLACE FUNCTION public.trg_talleres_aprobacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_estado := 'pendiente';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_estado := OLD.aprobacion_estado;
    END IF;
  END IF;

  -- Igual que tiendas: al quedar aprobado sin membresía, +30 días (visible en mapa / búsqueda pública).
  IF NEW.aprobacion_estado = 'aprobado'
     AND NEW.membresia_hasta IS NULL
     AND COALESCE(NEW.bloqueado, false) = false THEN
    NEW.membresia_hasta := (CURRENT_DATE + interval '30 day')::date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talleres_aprobacion_guard ON public.talleres;
CREATE TRIGGER talleres_aprobacion_guard
  BEFORE INSERT OR UPDATE ON public.talleres
  FOR EACH ROW EXECUTE FUNCTION public.trg_talleres_aprobacion();

CREATE OR REPLACE FUNCTION public.trg_productos_aprobacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_publica := 'pendiente';
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

-- 6) RLS: lectura pública restringida; dueño sigue viendo lo suyo; admin ve todo

-- PRODUCTOS
DROP POLICY IF EXISTS "Publico puede leer productos para busqueda" ON public.productos;
DROP POLICY IF EXISTS "Dueño ve sus productos" ON public.productos;
DROP POLICY IF EXISTS "Publico ve productos aprobados" ON public.productos;
DROP POLICY IF EXISTS "Admin ve todos los productos" ON public.productos;

CREATE POLICY "Dueño ve sus productos"
  ON public.productos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tiendas t
      WHERE t.id = productos.tienda_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Publico ve productos aprobados"
  ON public.productos FOR SELECT
  USING (
    activo = true
    AND aprobacion_publica = 'aprobado'
    AND EXISTS (
      SELECT 1 FROM public.tiendas t
      WHERE t.id = productos.tienda_id
        AND t.aprobacion_estado = 'aprobado'
        AND coalesce(t.bloqueado, false) = false
        AND t.membresia_hasta IS NOT NULL
        AND t.membresia_hasta >= CURRENT_DATE
    )
  );

CREATE POLICY "Admin ve todos los productos"
  ON public.productos FOR SELECT
  USING (public.is_admin());

-- Escritura: dueño de la tienda (añade si en tu proyecto no existían políticas equivalentes)
DROP POLICY IF EXISTS "Dueño inserta productos en su tienda" ON public.productos;
CREATE POLICY "Dueño inserta productos en su tienda"
  ON public.productos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tiendas t
      WHERE t.id = productos.tienda_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Dueño actualiza sus productos" ON public.productos;
CREATE POLICY "Dueño actualiza sus productos"
  ON public.productos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tiendas t
      WHERE t.id = productos.tienda_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tiendas t
      WHERE t.id = productos.tienda_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Dueño elimina sus productos" ON public.productos;
CREATE POLICY "Dueño elimina sus productos"
  ON public.productos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tiendas t
      WHERE t.id = productos.tienda_id AND t.user_id = auth.uid()
    )
  );

-- TIENDAS: quitar lectura abierta; público solo aprobadas con membresía
DROP POLICY IF EXISTS "Publico puede leer tiendas para busqueda" ON public.tiendas;

DROP POLICY IF EXISTS "Publico ve tiendas con membresia activa" ON public.tiendas;
CREATE POLICY "Publico ve tiendas con membresia activa"
  ON public.tiendas FOR SELECT
  USING (
    aprobacion_estado = 'aprobado'
    AND coalesce(bloqueado, false) = false
    AND membresia_hasta IS NOT NULL
    AND membresia_hasta >= CURRENT_DATE
  );

DROP POLICY IF EXISTS "Admin ve todas las tiendas" ON public.tiendas;
CREATE POLICY "Admin ve todas las tiendas"
  ON public.tiendas FOR SELECT
  USING (public.is_admin());

-- TALLERES
DROP POLICY IF EXISTS "Permitir leer talleres" ON public.talleres;
CREATE POLICY "Permitir leer talleres"
  ON public.talleres FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      aprobacion_estado = 'aprobado'
      AND coalesce(bloqueado, false) = false
      AND membresia_hasta IS NOT NULL
      AND membresia_hasta >= CURRENT_DATE
    )
    OR public.is_admin()
  );

-- 7) RPCs para que el panel admin cambie aprobación (triggers permiten admin)
CREATE OR REPLACE FUNCTION public.admin_set_tienda_aprobacion(p_tienda_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_estado NOT IN ('pendiente', 'aprobado', 'rechazado') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  UPDATE public.tiendas SET aprobacion_estado = p_estado WHERE id = p_tienda_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_taller_aprobacion(p_taller_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_estado NOT IN ('pendiente', 'aprobado', 'rechazado') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  UPDATE public.talleres
  SET
    aprobacion_estado = p_estado,
    membresia_hasta = CASE
      WHEN p_estado = 'aprobado'
        AND COALESCE(bloqueado, false) = false
        AND (membresia_hasta IS NULL OR membresia_hasta < CURRENT_DATE)
        THEN (CURRENT_DATE + interval '30 day')::date
      ELSE membresia_hasta
    END
  WHERE id = p_taller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_producto_aprobacion_publica(p_producto_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_estado NOT IN ('pendiente', 'aprobado', 'rechazado') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  UPDATE public.productos SET aprobacion_publica = p_estado WHERE id = p_producto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_tienda_aprobacion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_taller_aprobacion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_producto_aprobacion_publica(uuid, text) TO authenticated;
