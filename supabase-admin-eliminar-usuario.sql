-- Eliminar usuario desde el panel admin (sin usar la consola de Supabase manualmente).
-- Ejecutar en Supabase → SQL Editor.
-- Requisito: tu usuario admin con raw_app_meta_data.role = 'admin' (app_metadata; ver supabase-admin-panel.sql).
--
-- Borra en orden: productos de sus tiendas → tiendas → talleres → historial → identities → auth.users.
-- Las imágenes en Storage (bucket productos) pueden quedar huérfanas; limpia manualmente si lo necesitas.
-- Si falla DELETE en auth.identities o auth.users, revisa permisos del rol de la función o usa Auth → Users en el dashboard.

create or replace function public.admin_eliminar_usuario(p_user_id uuid)
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

  if p_user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta desde el panel. Usa otra cuenta administrador.';
  end if;

  -- Productos de todas las tiendas de ese usuario (contactos_productos hace cascade al borrar productos)
  delete from public.productos
  where tienda_id in (select id from public.tiendas where user_id = p_user_id);

  delete from public.tiendas where user_id = p_user_id;

  delete from public.talleres where user_id = p_user_id;

  delete from public.historial_contactos_producto where user_id = p_user_id;

  -- Identidades vinculadas (por si el FK no hace cascade en tu versión)
  delete from auth.identities where user_id = p_user_id;

  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_eliminar_usuario(uuid) to authenticated;
