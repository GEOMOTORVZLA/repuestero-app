-- Eliminar usuario desde el panel admin (sin usar la consola de Supabase manualmente).
-- Ejecutar en Supabase → SQL Editor (vuelve a ejecutarlo si ya lo tenías: REPLACE actualiza la función).
-- Requisito: tu usuario admin con raw_app_meta_data.role = 'admin' (app_metadata; ver supabase-admin-panel.sql).
--
-- Borra en orden: contactos → productos → tiendas → talleres → historial → identities → auth.users.
-- Las imágenes en Storage (bucket productos) pueden quedar huérfanas; limpia manualmente si lo necesitas.
-- Si falla DELETE en auth.identities o auth.users, revisa permisos del rol de la función o usa Auth → Users en el dashboard.

create or replace function public.admin_eliminar_usuario(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tienda_ids uuid[];
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

  if p_user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta desde el panel. Usa otra cuenta administrador.';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_tienda_ids
  from public.tiendas
  where user_id = p_user_id;

  -- Contactos ligados a esas tiendas (si la FK no es cascade)
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'contactos_productos'
  ) and cardinality(v_tienda_ids) > 0 then
    delete from public.contactos_productos
    where tienda_id = any (v_tienda_ids);
  end if;

  -- Productos de todas las tiendas de ese usuario
  if cardinality(v_tienda_ids) > 0 then
    delete from public.productos
    where tienda_id = any (v_tienda_ids);
  end if;

  delete from public.tiendas where user_id = p_user_id;

  delete from public.talleres where user_id = p_user_id;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'historial_contactos_producto'
  ) then
    delete from public.historial_contactos_producto where user_id = p_user_id;
  end if;

  -- Identidades vinculadas (por si el FK no hace cascade en tu versión)
  delete from auth.identities where user_id = p_user_id;

  delete from auth.users where id = p_user_id;

  -- Seguridad: si quedó alguna tienda/taller huérfana con ese user_id (no debería), limpia.
  delete from public.tiendas where user_id = p_user_id;
  delete from public.talleres where user_id = p_user_id;
end;
$$;

grant execute on function public.admin_eliminar_usuario(uuid) to authenticated;

-- Diagnóstico opcional: tiendas cuyo usuario Auth ya no existe (fantasmas en Vendedores).
-- select t.id, t.nombre_comercial, t.rif, t.user_id, t.email, t.created_at
-- from public.tiendas t
-- left join auth.users u on u.id = t.user_id
-- where u.id is null
-- order by t.created_at desc;
