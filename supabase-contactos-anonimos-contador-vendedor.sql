-- Contactar sin sesion + contador en el panel del vendedor.
-- Ejecutar UNA VEZ en Supabase SQL Editor (despues de supabase-admin-flujo-contactos.sql).

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

grant execute on function public.registrar_evento_contacto(text, text, uuid, uuid, uuid) to anon, authenticated;

create or replace function public.vendedor_conteo_contactos()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  hoy_ini timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.tiendas t where t.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  hoy_ini := ((timezone('America/Caracas', now()))::date::timestamp AT TIME ZONE 'America/Caracas');

  return json_build_object(
    'total', (
      select count(*)::int
      from public.contactos_productos c
      where c.tienda_id in (select t.id from public.tiendas t where t.user_id = auth.uid())
    ),
    'hoy', (
      select count(*)::int
      from public.contactos_productos c
      where c.tienda_id in (select t.id from public.tiendas t where t.user_id = auth.uid())
        and c.created_at >= hoy_ini
    ),
    'd7', (
      select count(*)::int
      from public.contactos_productos c
      where c.tienda_id in (select t.id from public.tiendas t where t.user_id = auth.uid())
        and c.created_at >= now() - interval '7 days'
    )
  );
end;
$$;

grant execute on function public.vendedor_conteo_contactos() to authenticated;

NOTIFY pgrst, 'reload schema';

