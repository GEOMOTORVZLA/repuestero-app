-- Inventario por vendedor (panel admin). Ejecutar en Supabase SQL Editor.

create or replace function public.admin_inventario_por_vendedor(
  p_buscar text default '',
  p_filtro text default 'todos',
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  nombre text,
  nombre_comercial text,
  rif text,
  telefono text,
  email text,
  estado text,
  ciudad text,
  created_at timestamptz,
  vertical text,
  items_cargados int
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  q text := lower(btrim(coalesce(p_buscar, '')));
  lim int := greatest(1, least(coalesce(p_limit, 1000), 1000));
  off int := greatest(0, coalesce(p_offset, 0));
  filtro text := lower(btrim(coalesce(p_filtro, 'todos')));
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  with conteo as (
    select p.tienda_id, count(*)::int as n
    from public.productos p
    group by p.tienda_id
  )
  select
    t.id,
    t.user_id,
    t.nombre,
    t.nombre_comercial,
    t.rif,
    t.telefono,
    t.email,
    t.estado,
    t.ciudad,
    t.created_at,
    t.vertical,
    coalesce(c.n, 0)::int as items_cargados
  from public.tiendas t
  left join conteo c on c.tienda_id = t.id
  where (
    q = ''
    or coalesce(t.nombre, '') ilike '%' || q || '%'
    or coalesce(t.nombre_comercial, '') ilike '%' || q || '%'
    or coalesce(t.telefono, '') ilike '%' || q || '%'
    or coalesce(t.estado, '') ilike '%' || q || '%'
    or coalesce(t.ciudad, '') ilike '%' || q || '%'
    or coalesce(t.rif, '') ilike '%' || q || '%'
  )
  and (
    filtro in ('', 'todos')
    or (filtro in ('sin_items', 'sin_inventario', 'cero') and coalesce(c.n, 0) = 0)
    or (filtro in ('con_items', 'con_inventario') and coalesce(c.n, 0) > 0)
  )
  order by t.created_at desc nulls last, t.id desc
  limit lim
  offset off;
end;
$$;

grant execute on function public.admin_inventario_por_vendedor(text, text, int, int) to authenticated;

NOTIFY pgrst, 'reload schema';