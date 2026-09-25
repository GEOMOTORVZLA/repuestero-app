-- Flujo admin: eventos de Contactar (modal / WhatsApp) que no se borran.
-- Ejecutar UNA VEZ en Supabase SQL Editor.
-- El historial de 5 del comprador no se toca.

create table if not exists public.contactos_productos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  producto_id uuid null references public.productos(id) on delete set null,
  tienda_id uuid null references public.tiendas(id) on delete set null,
  tipo_contacto text not null,
  origen text null,
  user_id uuid null,
  ip_cliente text null,
  user_agent text null
);

create table if not exists public.contactos_talleres (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  taller_id uuid not null references public.talleres(id) on delete cascade,
  tipo_contacto text not null,
  origen text null,
  user_id uuid null,
  ip_cliente text null,
  user_agent text null
);

alter table public.contactos_productos
  alter column producto_id drop not null;

alter table public.contactos_productos
  add column if not exists user_id uuid;

alter table public.contactos_talleres
  add column if not exists user_id uuid;

create index if not exists contactos_productos_producto_id_idx
  on public.contactos_productos (producto_id);
create index if not exists contactos_productos_tienda_id_idx
  on public.contactos_productos (tienda_id);
create index if not exists contactos_productos_created_at_idx
  on public.contactos_productos (created_at desc);
create index if not exists contactos_productos_tipo_created_idx
  on public.contactos_productos (tipo_contacto, created_at desc);

create index if not exists contactos_talleres_taller_id_idx
  on public.contactos_talleres (taller_id);
create index if not exists contactos_talleres_created_at_idx
  on public.contactos_talleres (created_at desc);

alter table public.contactos_productos enable row level security;
alter table public.contactos_talleres enable row level security;

drop policy if exists "vendedor ve contactos de su tienda" on public.contactos_productos;
create policy "vendedor ve contactos de su tienda"
  on public.contactos_productos
  for select
  to authenticated
  using (
    tienda_id in (select id from public.tiendas where user_id = auth.uid())
  );

drop policy if exists "taller ve contactos de su taller" on public.contactos_talleres;
create policy "taller ve contactos de su taller"
  on public.contactos_talleres
  for select
  to authenticated
  using (
    taller_id in (select id from public.talleres where user_id = auth.uid())
  );

revoke insert, update, delete on public.contactos_productos from anon, authenticated;
revoke insert, update, delete on public.contactos_talleres from anon, authenticated;
grant select on public.contactos_productos to authenticated;
grant select on public.contactos_talleres to authenticated;

create or replace function public.registrar_evento_contacto(
  p_tipo text,
  p_origen text default '',
  p_producto_id uuid default null,
  p_tienda_id uuid default null,
  p_taller_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
  v_origen text := left(trim(coalesce(p_origen, '')), 80);
  v_tienda uuid := p_tienda_id;
begin
  if auth.uid() is null then
    return;
  end if;

  if v_tipo not in ('contactar_modal', 'whatsapp') then
    return;
  end if;

  if v_origen = '' then
    v_origen := 'desconocido';
  end if;

  if p_taller_id is not null then
    insert into public.contactos_talleres (taller_id, tipo_contacto, origen, user_id)
    values (p_taller_id, v_tipo, v_origen, auth.uid());
    return;
  end if;

  if v_tienda is null and p_producto_id is not null then
    select p.tienda_id into v_tienda
    from public.productos p
    where p.id = p_producto_id;
  end if;

  if v_tienda is null and p_producto_id is null then
    return;
  end if;

  insert into public.contactos_productos (producto_id, tienda_id, tipo_contacto, origen, user_id)
  values (p_producto_id, v_tienda, v_tipo, v_origen, auth.uid());
end;
$$;

grant execute on function public.registrar_evento_contacto(text, text, uuid, uuid, uuid) to authenticated;

create or replace function public.admin_flujo_contactos()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  hoy_ini timestamptz;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  hoy_ini := ((timezone('America/Caracas', now()))::date::timestamp AT TIME ZONE 'America/Caracas');

  return json_build_object(
    'hoy', (
      select json_build_object(
        'modal', coalesce(count(*) filter (where tipo_contacto = 'contactar_modal'), 0)::int,
        'whatsapp', coalesce(count(*) filter (where tipo_contacto = 'whatsapp'), 0)::int,
        'total', coalesce(count(*), 0)::int
      )
      from (
        select tipo_contacto, created_at from public.contactos_productos
        union all
        select tipo_contacto, created_at from public.contactos_talleres
      ) e
      where e.created_at >= hoy_ini
    ),
    'd7', (
      select json_build_object(
        'modal', coalesce(count(*) filter (where tipo_contacto = 'contactar_modal'), 0)::int,
        'whatsapp', coalesce(count(*) filter (where tipo_contacto = 'whatsapp'), 0)::int,
        'total', coalesce(count(*), 0)::int
      )
      from (
        select tipo_contacto, created_at from public.contactos_productos
        union all
        select tipo_contacto, created_at from public.contactos_talleres
      ) e
      where e.created_at >= now() - interval '7 days'
    ),
    'd30', (
      select json_build_object(
        'modal', coalesce(count(*) filter (where tipo_contacto = 'contactar_modal'), 0)::int,
        'whatsapp', coalesce(count(*) filter (where tipo_contacto = 'whatsapp'), 0)::int,
        'total', coalesce(count(*), 0)::int
      )
      from (
        select tipo_contacto, created_at from public.contactos_productos
        union all
        select tipo_contacto, created_at from public.contactos_talleres
      ) e
      where e.created_at >= now() - interval '30 days'
    ),
    'top_vendedores', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select
          c.tienda_id,
          coalesce(nullif(trim(t.nombre_comercial), ''), nullif(trim(t.nombre), ''), c.tienda_id::text) as nombre,
          count(*)::int as total
        from public.contactos_productos c
        left join public.tiendas t on t.id = c.tienda_id
        where c.created_at >= now() - interval '30 days'
          and c.tienda_id is not null
        group by c.tienda_id, t.nombre_comercial, t.nombre
        order by count(*) desc
        limit 10
      ) x
    ),
    'top_productos', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select
          c.producto_id,
          coalesce(nullif(trim(p.nombre), ''), c.producto_id::text) as nombre,
          count(*)::int as total
        from public.contactos_productos c
        left join public.productos p on p.id = c.producto_id
        where c.created_at >= now() - interval '30 days'
          and c.producto_id is not null
        group by c.producto_id, p.nombre
        order by count(*) desc
        limit 10
      ) x
    ),
    'top_talleres', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select
          c.taller_id,
          coalesce(nullif(trim(t.nombre_comercial), ''), nullif(trim(t.nombre), ''), c.taller_id::text) as nombre,
          count(*)::int as total
        from public.contactos_talleres c
        left join public.talleres t on t.id = c.taller_id
        where c.created_at >= now() - interval '30 days'
        group by c.taller_id, t.nombre_comercial, t.nombre
        order by count(*) desc
        limit 10
      ) x
    )
  );
end;
$$;

grant execute on function public.admin_flujo_contactos() to authenticated;

NOTIFY pgrst, 'reload schema';