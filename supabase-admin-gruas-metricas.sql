-- Metricas admin de gruas: KPI total y conteo por estado.
-- Ejecutar en Supabase SQL Editor (despues de supabase-admin-gruas.sql).

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
    'talleres_suspendidos_impago', (
      select count(*)::int
      from public.talleres t
      where public.tienda_suspendida_por_impago(t.aprobacion_estado, t.bloqueado, t.membresia_hasta)
    ),
    'gruas_total', (select count(*)::int from public.gruas),
    'compradores_total', compradores_ct::int,
    'productos_total', (select count(*)::int from public.productos),
    'productos_activos', (select count(*)::int from public.productos where coalesce(activo, false) = true),
    'productos_pausados', (select count(*)::int from public.productos where coalesce(activo, false) = false),
    'productos_pausados_fecha', (
      select count(*)::int from public.productos
      where coalesce(activo, false) = false
        and coalesce(pausado_por_stock_vencido, false) = true
    ),
    'productos_pausados_stock0', (
      select count(*)::int from public.productos
      where coalesce(activo, false) = false
        and coalesce(pausado_por_stock_vencido, false) = false
        and coalesce(stock_actual, -1) = 0
    ),
    'productos_pausados_vendedor', (
      select count(*)::int from public.productos
      where coalesce(activo, false) = false
        and coalesce(pausado_por_stock_vencido, false) = false
        and coalesce(stock_actual, -1) <> 0
    ),
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

drop function if exists public.admin_conteo_por_estado();

create function public.admin_conteo_por_estado()
returns table (
  estado text,
  orden int,
  vendedores int,
  talleres int,
  gruas int,
  compradores int
)
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

  return query
  with catalogo_ok as (
    select * from (values
      (1, 'Distrito Capital'),
      (2, 'Amazonas'),
      (3, 'Anzoátegui'),
      (4, 'Apure'),
      (5, 'Aragua'),
      (6, 'Barinas'),
      (7, 'Bolívar'),
      (8, 'Carabobo'),
      (9, 'Cojedes'),
      (10, 'Delta Amacuro'),
      (11, 'Falcón'),
      (12, 'Guárico'),
      (13, 'La Guaira'),
      (14, 'Lara'),
      (15, 'Mérida'),
      (16, 'Miranda'),
      (17, 'Monagas'),
      (18, 'Nueva Esparta'),
      (19, 'Portuguesa'),
      (20, 'Sucre'),
      (21, 'Táchira'),
      (22, 'Trujillo'),
      (23, 'Yaracuy'),
      (24, 'Zulia')
    ) as e(orden, estado)
  ),
  vend as (
    select lower(public.admin_norm_estado_ve(t.estado)) as k, count(*)::int as n
    from public.tiendas t
    group by 1
  ),
  tall as (
    select lower(public.admin_norm_estado_ve(x.estado)) as k, count(*)::int as n
    from public.talleres x
    group by 1
  ),
  gru as (
    select lower(public.admin_norm_estado_ve(g.estado)) as k, count(*)::int as n
    from public.gruas g
    group by 1
  ),
  comp as (
    select lower(public.admin_norm_estado_ve(u.raw_user_meta_data -> 'perfil_comprador' ->> 'estado')) as k,
           count(*)::int as n
    from auth.users u
    where coalesce(u.raw_user_meta_data ->> 'tipo_cuenta', '') in ('comprador', 'usuario')
       or (u.raw_user_meta_data -> 'perfil_comprador') is not null
    group by 1
  ),
  oficiales as (
    select lower(c.estado) as k from catalogo_ok c
  )
  select q.estado, q.orden, q.vendedores, q.talleres, q.gruas, q.compradores
  from (
    select
      c.estado,
      c.orden,
      coalesce(v.n, 0)::int as vendedores,
      coalesce(ta.n, 0)::int as talleres,
      coalesce(gr.n, 0)::int as gruas,
      coalesce(co.n, 0)::int as compradores
    from catalogo_ok c
    left join vend v on v.k = lower(c.estado)
    left join tall ta on ta.k = lower(c.estado)
    left join gru gr on gr.k = lower(c.estado)
    left join comp co on co.k = lower(c.estado)
    union all
    select
      'Otro'::text,
      90,
      coalesce((select sum(vend.n) from vend where vend.k is not null and vend.k not in (select k from oficiales)), 0)::int,
      coalesce((select sum(tall.n) from tall where tall.k is not null and tall.k not in (select k from oficiales)), 0)::int,
      coalesce((select sum(gru.n) from gru where gru.k is not null and gru.k not in (select k from oficiales)), 0)::int,
      coalesce((select sum(comp.n) from comp where comp.k is not null and comp.k not in (select k from oficiales)), 0)::int
    union all
    select
      'Sin estado'::text,
      91,
      coalesce((select vend.n from vend where vend.k is null), 0)::int,
      coalesce((select tall.n from tall where tall.k is null), 0)::int,
      coalesce((select gru.n from gru where gru.k is null), 0)::int,
      coalesce((select comp.n from comp where comp.k is null), 0)::int
  ) q
  order by q.orden;
end;
$$;

grant execute on function public.admin_conteo_por_estado() to authenticated;

NOTIFY pgrst, 'reload schema';