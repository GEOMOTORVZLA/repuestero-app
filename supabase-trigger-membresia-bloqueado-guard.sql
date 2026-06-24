-- Paso 2 seguridad: vendedor/taller NO puede alterar membresia_hasta ni bloqueado.
-- Solo admin (is_admin / RPCs admin_set_*) puede cambiarlos.
-- Ejecutar una vez en Supabase -> SQL Editor (proyecto produccion).

-- TIENDAS (vendedores)
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

  -- Al quedar aprobada sin membresia, +30 dias (admin o flujo automatico).
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

-- TALLERES
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