-- Panel administrador: lectura global de usuarios y perfiles de compradores
-- El rol admin debe estar en app_metadata (raw_app_meta_data), NO en user_metadata:
-- el cliente puede modificar user_metadata vía auth.updateUser y escalarse privilegios.
-- Marca admin solo con SQL en el editor de Supabase (o Service Role):
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'tu-correo-admin@dominio.com';

-- Listas con búsqueda y límite (escala). Si ya tenías las funciones sin args, ejecuta antes
-- supabase-admin-busqueda-panel.sql o haz DROP de las firmas antiguas.
create or replace function public.admin_list_usuarios(
  p_buscar text default '',
  p_limit int default 200
)
returns table (
  user_id uuid,
  email text,
  tipo_cuenta text,
  role text,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  q text := trim(coalesce(p_buscar, ''));
  lim int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'tipo_cuenta', null)::text,
    nullif(coalesce(u.raw_app_meta_data ->> 'role', u.raw_user_meta_data ->> 'role'), '')::text,
    u.created_at
  from auth.users u
  where q = ''
     or u.email::text ilike '%' || q || '%'
     or u.id::text ilike '%' || q || '%'
     or coalesce(u.raw_user_meta_data ->> 'tipo_cuenta', '') ilike '%' || q || '%'
  order by u.created_at desc
  limit lim;
end;
$$;

grant execute on function public.admin_list_usuarios(text, int) to authenticated;

create or replace function public.admin_list_compradores(
  p_buscar text default '',
  p_limit int default 200
)
returns table (
  user_id uuid,
  email text,
  nombre text,
  nombre_comercial text,
  rif text,
  telefono text,
  estado text,
  ciudad text,
  creado_en timestamptz,
  suspendido_membresia boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  q text := trim(coalesce(p_buscar, ''));
  lim int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    u.id,
    u.email::text,
    nullif(u.raw_user_meta_data -> 'perfil_comprador' ->> 'nombre', '')::text,
    nullif(u.raw_user_meta_data -> 'perfil_comprador' ->> 'nombre_comercial', '')::text,
    nullif(u.raw_user_meta_data -> 'perfil_comprador' ->> 'rif', '')::text,
    nullif(u.raw_user_meta_data -> 'perfil_comprador' ->> 'telefono', '')::text,
    nullif(u.raw_user_meta_data -> 'perfil_comprador' ->> 'estado', '')::text,
    nullif(u.raw_user_meta_data -> 'perfil_comprador' ->> 'ciudad', '')::text,
    u.created_at,
    coalesce((u.raw_app_meta_data ->> 'suspendido_membresia')::boolean, false)
  from auth.users u
  where (
    coalesce(u.raw_user_meta_data ->> 'tipo_cuenta', '') in ('comprador', 'usuario')
    or (u.raw_user_meta_data -> 'perfil_comprador') is not null
  )
  and (
    q = ''
    or u.email::text ilike '%' || q || '%'
    or u.id::text ilike '%' || q || '%'
    or coalesce(u.raw_user_meta_data -> 'perfil_comprador' ->> 'nombre', '') ilike '%' || q || '%'
    or coalesce(u.raw_user_meta_data -> 'perfil_comprador' ->> 'nombre_comercial', '') ilike '%' || q || '%'
    or coalesce(u.raw_user_meta_data -> 'perfil_comprador' ->> 'rif', '') ilike '%' || q || '%'
    or coalesce(u.raw_user_meta_data -> 'perfil_comprador' ->> 'telefono', '') ilike '%' || q || '%'
  )
  order by u.created_at desc
  limit lim;
end;
$$;

grant execute on function public.admin_list_compradores(text, int) to authenticated;

alter table if exists public.tiendas
  add column if not exists bloqueado boolean not null default false;

alter table if exists public.talleres
  add column if not exists bloqueado boolean not null default false;

create or replace function public.admin_set_producto_activo(
  p_producto_id uuid,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  update public.productos
  set activo = p_activo
  where id = p_producto_id;
end;
$$;

grant execute on function public.admin_set_producto_activo(uuid, boolean) to authenticated;

-- Activar / pausar muchos productos en una sola llamada (panel admin, listado filtrado).
create or replace function public.admin_set_productos_activo_bulk(
  p_producto_ids uuid[],
  p_activo boolean
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int := 0;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  if p_producto_ids is null or coalesce(cardinality(p_producto_ids), 0) = 0 then
    return 0;
  end if;

  update public.productos
  set activo = p_activo
  where id = any (p_producto_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.admin_set_productos_activo_bulk(uuid[], boolean) to authenticated;

-- Eliminar productos por ids (admin). Respeta FKs en tablas hijas con ON DELETE CASCADE.
create or replace function public.admin_eliminar_productos(
  p_producto_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int := 0;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  if p_producto_ids is null or coalesce(cardinality(p_producto_ids), 0) = 0 then
    return 0;
  end if;

  delete from public.productos
  where id = any (p_producto_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.admin_eliminar_productos(uuid[]) to authenticated;

create or replace function public.admin_set_tienda_bloqueada(
  p_tienda_id uuid,
  p_bloqueada boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  update public.tiendas
  set bloqueado = p_bloqueada
  where id = p_tienda_id;
end;
$$;

grant execute on function public.admin_set_tienda_bloqueada(uuid, boolean) to authenticated;

-- Fecha de fin de membresía (tras pago u operación manual). Solo rol admin.
create or replace function public.admin_set_tienda_membresia_hasta(
  p_tienda_id uuid,
  p_membresia_hasta date
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  update public.tiendas
  set membresia_hasta = p_membresia_hasta
  where id = p_tienda_id;
end;
$$;

grant execute on function public.admin_set_tienda_membresia_hasta(uuid, date) to authenticated;

create or replace function public.admin_set_taller_bloqueado(
  p_taller_id uuid,
  p_bloqueado boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  update public.talleres
  set bloqueado = p_bloqueado
  where id = p_taller_id;
end;
$$;

grant execute on function public.admin_set_taller_bloqueado(uuid, boolean) to authenticated;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  role_final text;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  role_final := nullif(trim(coalesce(p_role, '')), '');

  update auth.users
  set
    raw_app_meta_data = case
      when role_final is null then coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
      else coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', role_final)
    end,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'role'
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- Suspensión por membresía / impago (compradores): solo app_metadata
create or replace function public.admin_set_comprador_suspendido_membresia(
  p_user_id uuid,
  p_suspendido boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  if p_user_id is null then
    raise exception 'Usuario inválido';
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('suspendido_membresia', coalesce(p_suspendido, false))
  where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_comprador_suspendido_membresia(uuid, boolean) to authenticated;

-- === Panel admin: en Supabase → SQL Editor, copia el bloque que empieza en
--     "-- Criterio único tienda suspendida..." y termina en "NOTIFY pgrst, 'reload schema';" inclusiva. ===

-- Criterio único: tienda aprobada sin visibilidad pública por impago (KPI + listado admin).
create or replace function public.tienda_suspendida_por_impago(
  p_aprobacion_estado text,
  p_bloqueado boolean,
  p_membresia_hasta date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_aprobacion_estado, 'aprobado') = 'aprobado'
    and (
      coalesce(p_bloqueado, false) = true
      or p_membresia_hasta is null
      or p_membresia_hasta < current_date
    );
$$;

grant execute on function public.tienda_suspendida_por_impago(text, boolean, date) to authenticated;

-- Listado del modal KPI «vendedores suspendidos por impago» (misma lógica que admin_dashboard_counts).
drop function if exists public.admin_list_tiendas_suspendidas_impago(int);

create or replace function public.admin_list_tiendas_suspendidas_impago(
  p_limit int default 500
)
returns table (
  id uuid,
  user_id uuid,
  nombre text,
  nombre_comercial text,
  rif text,
  telefono text,
  estado text,
  ciudad text,
  bloqueado boolean,
  aprobacion_estado text,
  created_at timestamptz,
  membresia_hasta date
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  lim int := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    t.id::uuid,
    t.user_id::uuid,
    t.nombre::text,
    t.nombre_comercial::text,
    t.rif::text,
    t.telefono::text,
    t.estado::text,
    t.ciudad::text,
    coalesce(t.bloqueado, false)::boolean,
    coalesce(t.aprobacion_estado, 'aprobado')::text,
    t.created_at::timestamptz,
    t.membresia_hasta::date
  from public.tiendas t
  where public.tienda_suspendida_por_impago(t.aprobacion_estado, t.bloqueado, t.membresia_hasta)
  order by t.created_at desc
  limit lim;
end;
$$;

grant execute on function public.admin_list_tiendas_suspendidas_impago(int) to authenticated;

-- KPIs del resumen sin cargar miles de filas al navegador
create or replace function public.admin_dashboard_counts()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  compradores_ct bigint;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  select count(*) into compradores_ct
  from auth.users u
  where (
    coalesce(u.raw_user_meta_data ->> 'tipo_cuenta', '') in ('comprador', 'usuario')
    or (u.raw_user_meta_data -> 'perfil_comprador') is not null
  );

  return json_build_object(
    'usuarios_total', (select count(*)::int from auth.users),
    'vendedores_total', (select count(*)::int from public.tiendas),
    'vendedores_suspendidos_impago', (
      select count(*)::int
      from public.tiendas t
      where public.tienda_suspendida_por_impago(t.aprobacion_estado, t.bloqueado, t.membresia_hasta)
    ),
    'talleres_total', (select count(*)::int from public.talleres),
    'compradores_total', compradores_ct::int,
    'productos_total', (select count(*)::int from public.productos),
    'productos_activos', (select count(*)::int from public.productos where coalesce(activo, false) = true),
    'productos_pausados', (select count(*)::int from public.productos where coalesce(activo, false) = false),
    'productos_auto', (select count(*)::int from public.productos where coalesce(vertical, 'auto') = 'auto'),
    'productos_moto', (select count(*)::int from public.productos where vertical = 'moto'),
    'tiendas_pendientes_aprobacion', (
      select count(*)::int from public.tiendas where coalesce(aprobacion_estado, 'aprobado') = 'pendiente'
    ),
    'talleres_pendientes_aprobacion', (
      select count(*)::int from public.talleres where coalesce(aprobacion_estado, 'aprobado') = 'pendiente'
    ),
    'productos_pendientes_web', (
      select count(*)::int from public.productos where coalesce(aprobacion_publica, 'aprobado') = 'pendiente'
    )
  );
end;
$$;

grant execute on function public.admin_dashboard_counts() to authenticated;

-- PostgREST (API de Supabase) a veces tarda en ver funciones nuevas o con firma distinta.
-- Esto fuerza recarga del schema cache sin reiniciar el proyecto.
NOTIFY pgrst, 'reload schema';
