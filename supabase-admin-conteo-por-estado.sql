-- Conteo admin de vendedores, talleres y compradores por estado.
-- Ejecutar UNA VEZ en Supabase SQL Editor. Solo lo usa el panel admin.

create or replace function public.admin_norm_estado_ve(p text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(p), '') is null then null
    when lower(btrim(p)) in ('vargas', 'edo vargas', 'estado vargas') then 'La Guaira'
    when lower(btrim(p)) in ('la guaira') then 'La Guaira'
    when lower(btrim(p)) in ('dtto capital', 'distrito capital', 'd.f.', 'df') then 'Distrito Capital'
    when lower(btrim(p)) in ('anzoategui', 'anzoátegui') then 'Anzoátegui'
    when lower(btrim(p)) in ('bolivar', 'bolívar') then 'Bolívar'
    when lower(btrim(p)) in ('falcon', 'falcón') then 'Falcón'
    when lower(btrim(p)) in ('guarico', 'guárico') then 'Guárico'
    when lower(btrim(p)) in ('merida', 'mérida') then 'Mérida'
    when lower(btrim(p)) in ('tachira', 'táchira') then 'Táchira'
    else btrim(p)
  end
$$;

create or replace function public.admin_conteo_por_estado()
returns table (
  estado text,
  orden int,
  vendedores int,
  talleres int,
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
  select q.estado, q.orden, q.vendedores, q.talleres, q.compradores
  from (
    select
      c.estado,
      c.orden,
      coalesce(v.n, 0)::int as vendedores,
      coalesce(ta.n, 0)::int as talleres,
      coalesce(co.n, 0)::int as compradores
    from catalogo_ok c
    left join vend v on v.k = lower(c.estado)
    left join tall ta on ta.k = lower(c.estado)
    left join comp co on co.k = lower(c.estado)
    union all
    select
      'Otro'::text,
      90,
      coalesce((select sum(vend.n) from vend where vend.k is not null and vend.k not in (select k from oficiales)), 0)::int,
      coalesce((select sum(tall.n) from tall where tall.k is not null and tall.k not in (select k from oficiales)), 0)::int,
      coalesce((select sum(comp.n) from comp where comp.k is not null and comp.k not in (select k from oficiales)), 0)::int
    union all
    select
      'Sin estado'::text,
      91,
      coalesce((select vend.n from vend where vend.k is null), 0)::int,
      coalesce((select tall.n from tall where tall.k is null), 0)::int,
      coalesce((select comp.n from comp where comp.k is null), 0)::int
  ) q
  order by q.orden;
end;
$$;

grant execute on function public.admin_conteo_por_estado() to authenticated;

NOTIFY pgrst, 'reload schema';

