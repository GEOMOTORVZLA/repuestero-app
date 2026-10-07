-- Panel admin de gruas (mismo criterio que talleres).
-- Ejecutar en Supabase -> SQL Editor.

drop policy if exists "Permitir leer gruas publicas" on public.gruas;
create policy "Permitir leer gruas publicas"
  on public.gruas for select
  using (
    auth.uid() = user_id
    or (
      aprobacion_estado = 'aprobado'
      and coalesce(bloqueado, false) = false
      and (membresia_hasta is null or membresia_hasta >= current_date)
    )
    or public.is_admin()
  );

create or replace function public.trg_gruas_aprobacion()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.aprobacion_estado := 'pendiente';
      new.bloqueado := false;
      new.membresia_hasta := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if not public.is_admin() then
      new.aprobacion_estado := old.aprobacion_estado;
      new.membresia_hasta := old.membresia_hasta;
      new.bloqueado := old.bloqueado;
    end if;
  end if;

  if new.aprobacion_estado = 'aprobado'
     and new.membresia_hasta is null
     and coalesce(new.bloqueado, false) = false then
    new.membresia_hasta := (current_date + interval '30 day')::date;
  end if;

  return new;
end;
$$;

drop trigger if exists gruas_aprobacion_guard on public.gruas;
create trigger gruas_aprobacion_guard
  before insert or update on public.gruas
  for each row execute function public.trg_gruas_aprobacion();

create or replace function public.admin_set_grua_aprobacion(p_grua_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  if p_estado not in ('pendiente', 'aprobado', 'rechazado') then
    raise exception 'Estado invalido';
  end if;
  update public.gruas
  set
    aprobacion_estado = p_estado,
    membresia_hasta = case
      when p_estado = 'aprobado'
        and coalesce(bloqueado, false) = false
        and (membresia_hasta is null or membresia_hasta < current_date)
        then (current_date + interval '30 day')::date
      else membresia_hasta
    end
  where id = p_grua_id;
end;
$$;

grant execute on function public.admin_set_grua_aprobacion(uuid, text) to authenticated;

create or replace function public.admin_set_grua_membresia_hasta(
  p_grua_id uuid,
  p_membresia_hasta date
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  update public.gruas
  set membresia_hasta = p_membresia_hasta
  where id = p_grua_id;
end;
$$;

grant execute on function public.admin_set_grua_membresia_hasta(uuid, date) to authenticated;

create or replace function public.admin_set_grua_bloqueada(
  p_grua_id uuid,
  p_bloqueada boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  update public.gruas
  set bloqueado = p_bloqueada
  where id = p_grua_id;
end;
$$;

grant execute on function public.admin_set_grua_bloqueada(uuid, boolean) to authenticated;

create or replace function public.admin_set_grua_ubicacion(
  p_grua_id uuid,
  p_latitud double precision,
  p_longitud double precision
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  if p_latitud < 0.5 or p_latitud > 12.6 or p_longitud < -73.4 or p_longitud > -59.8 then
    raise exception 'Coordenadas fuera de Venezuela';
  end if;
  if abs(p_latitud) < 0.0001 and abs(p_longitud) < 0.0001 then
    raise exception 'Coordenadas invalidas (0,0)';
  end if;
  update public.gruas
  set latitud = p_latitud,
      longitud = p_longitud
  where id = p_grua_id;
  if not found then
    raise exception 'Grua no encontrada';
  end if;
end;
$$;

grant execute on function public.admin_set_grua_ubicacion(uuid, double precision, double precision) to authenticated;