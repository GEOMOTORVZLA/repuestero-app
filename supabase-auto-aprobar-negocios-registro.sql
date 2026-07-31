-- Auto-aprobacion al registrar tiendas/talleres + migracion de pendientes.
-- Ejecutar UNA VEZ en Supabase → SQL Editor.

UPDATE public.tiendas
SET
  aprobacion_estado = 'aprobado',
  membresia_hasta = CASE
    WHEN membresia_hasta IS NULL OR membresia_hasta < CURRENT_DATE
      THEN (CURRENT_DATE + interval '30 day')::date
    ELSE membresia_hasta
  END
WHERE aprobacion_estado = 'pendiente'
  AND COALESCE(bloqueado, false) = false;

UPDATE public.talleres
SET
  aprobacion_estado = 'aprobado',
  membresia_hasta = CASE
    WHEN membresia_hasta IS NULL OR membresia_hasta < CURRENT_DATE
      THEN (CURRENT_DATE + interval '30 day')::date
    ELSE membresia_hasta
  END
WHERE aprobacion_estado = 'pendiente'
  AND COALESCE(bloqueado, false) = false;

CREATE OR REPLACE FUNCTION public.trg_tiendas_aprobacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_admin() THEN
      NEW.aprobacion_estado := 'aprobado';
      NEW.bloqueado := false;
      IF NEW.membresia_hasta IS NULL THEN
        NEW.membresia_hasta := (CURRENT_DATE + interval '30 day')::date;
      END IF;
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
      NEW.aprobacion_estado := 'aprobado';
      NEW.bloqueado := false;
      IF NEW.membresia_hasta IS NULL THEN
        NEW.membresia_hasta := (CURRENT_DATE + interval '30 day')::date;
      END IF;
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