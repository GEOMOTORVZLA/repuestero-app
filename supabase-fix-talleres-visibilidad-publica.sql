-- FIX PRODUCCIÓN: talleres aprobados invisibles para usuarios públicos
-- Ejecutar UNA VEZ en Supabase → SQL Editor (proyecto en vivo).
--
-- Causa: RLS exige aprobacion_estado = 'aprobado', no bloqueado y membresia_hasta >= hoy.
-- El admin ve todo (is_admin); el público no si falta membresía o vertical.

-- 1) Datos existentes: talleres aprobados sin membresía vigente → +30 días
UPDATE public.talleres
SET membresia_hasta = (CURRENT_DATE + interval '30 day')::date
WHERE aprobacion_estado = 'aprobado'
  AND COALESCE(bloqueado, false) = false
  AND (membresia_hasta IS NULL OR membresia_hasta < CURRENT_DATE);

-- 2) vertical NULL impide búsqueda (.eq('vertical', 'auto'))
UPDATE public.talleres
SET vertical = 'auto'
WHERE vertical IS NULL OR btrim(vertical) = '';

-- 3) Trigger: al aprobar, asignar membresía si falta (dueño no puede tocar membresia/bloqueado)
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
      NEW.bloqueado := false;
      NEW.membresia_hasta := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_estado := OLD.aprobacion_estado;
      NEW.membresia_hasta := OLD.membresia_hasta;
      NEW.bloqueado := OLD.bloqueado;
    END IF;
  END IF;

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

-- 4) RPC del panel admin: al pulsar Aprobar, membresía +30 días si falta o venció
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

GRANT EXECUTE ON FUNCTION public.admin_set_taller_aprobacion(uuid, text) TO authenticated;

-- 5) RPC panel admin: renovar membresía manual (+30 días / +1 año)
CREATE OR REPLACE FUNCTION public.admin_set_taller_membresia_hasta(
  p_taller_id uuid,
  p_membresia_hasta date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE public.talleres
  SET membresia_hasta = p_membresia_hasta
  WHERE id = p_taller_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_taller_membresia_hasta(uuid, date) TO authenticated;

-- 6) Confirmar política RLS pública (idempotente)
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

-- 7) Verificación (debe mostrar VISIBLE al público en aprobados con membresía)
SELECT
  id,
  nombre_comercial,
  estado,
  ciudad,
  vertical,
  aprobacion_estado,
  membresia_hasta,
  CASE
    WHEN aprobacion_estado = 'aprobado'
      AND COALESCE(bloqueado, false) = false
      AND membresia_hasta IS NOT NULL
      AND membresia_hasta >= CURRENT_DATE
    THEN 'VISIBLE'
    ELSE 'OCULTO'
  END AS visibilidad_publica
FROM public.talleres
ORDER BY created_at DESC;

NOTIFY pgrst, 'reload schema';
