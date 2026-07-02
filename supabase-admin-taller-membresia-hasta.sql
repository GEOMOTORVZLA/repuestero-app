-- RPC panel admin: renovar membresia de talleres (+30 dias / +1 ano desde el dashboard).
-- Ejecuta en Supabase SQL Editor si el boton del panel falla con "function does not exist".

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

NOTIFY pgrst, 'reload schema';
