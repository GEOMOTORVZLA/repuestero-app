-- Membresia inicial automatica para tiendas aprobadas
-- Ejecutar una vez en Supabase SQL Editor.
--
-- Que hace:
-- 1) Rellena membresia_hasta para tiendas ya aprobadas que la tienen NULL.
-- 2) Extiende el trigger de aprobacion para que, al aprobar una tienda,
--    si membresia_hasta viene NULL, se asigne +30 dias.

-- 1) Backfill inicial para datos existentes
update public.tiendas
set membresia_hasta = (current_date + interval '30 day')::date
where aprobacion_estado = 'aprobado'
  and coalesce(bloqueado, false) = false
  and membresia_hasta is null;

-- 2) Trigger de aprobacion + membresia inicial automatica
create or replace function public.trg_tiendas_aprobacion()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.aprobacion_estado := 'pendiente';
    end if;
  elsif tg_op = 'UPDATE' then
    if not public.is_admin() then
      new.aprobacion_estado := old.aprobacion_estado;
    end if;
  end if;

  -- Si la tienda queda aprobada y no tiene membresia, asignar 30 dias iniciales.
  if new.aprobacion_estado = 'aprobado'
     and new.membresia_hasta is null
     and coalesce(new.bloqueado, false) = false then
    new.membresia_hasta := (current_date + interval '30 day')::date;
  end if;

  return new;
end;
$$;
