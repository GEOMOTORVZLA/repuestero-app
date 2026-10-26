-- Conteo de visitas al contacto de un vendedor, solo para el administrador.
-- Ejecutar UNA VEZ en Supabase SQL Editor.

create or replace function public.admin_conteo_contactos_vendedor(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_total int;
begin
  if auth.uid() is null or p_user_id is null then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  select count(*)::int into v_total
  from public.contactos_productos c
  where c.tienda_id in (
    select t.id from public.tiendas t where t.user_id = p_user_id
  );

  return json_build_object('total', coalesce(v_total, 0));
end;
$$;

grant execute on function public.admin_conteo_contactos_vendedor(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
