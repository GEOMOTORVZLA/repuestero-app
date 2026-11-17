-- Vitrina de visita: dos tiendas internas (auto y moto) para el visor de mostrador.
-- No salen en el mapa ni en la lista de vendedores: quedan sin aprobar, sin teléfono y sin ubicación.
-- Ejecutar UNA VEZ en Supabase → SQL Editor.

alter table public.tiendas alter column latitud drop not null;
alter table public.tiendas alter column longitud drop not null;

create or replace function public.admin_preparar_vitrina(
  p_vertical text,
  p_nombre_comercial text,
  p_vaciar boolean default false
)
returns table (tienda_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
declare
  v_vertical text;
  v_nombre text;
  v_rif text;
  v_email text;
  v_user_fijo uuid;
  v_user_id uuid;
  v_tienda_id uuid;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  v_vertical := case when lower(trim(coalesce(p_vertical, ''))) = 'moto' then 'moto' else 'auto' end;
  v_nombre := nullif(trim(coalesce(p_nombre_comercial, '')), '');
  if v_nombre is null or char_length(v_nombre) < 2 then
    raise exception 'Indica el nombre que verá el vendedor (mínimo 2 caracteres)';
  end if;

  if v_vertical = 'moto' then
    v_rif := 'VITRINA-MOTO';
    v_email := 'vitrina-moto@interno.geomotor';
    v_user_fijo := 'a7c1d2e3-4f50-4611-8b72-c3d4e5f60702';
  else
    v_rif := 'VITRINA-AUTO';
    v_email := 'vitrina-auto@interno.geomotor';
    v_user_fijo := 'a7c1d2e3-4f50-4611-8b72-c3d4e5f60701';
  end if;

  select u.id
    into v_user_id
  from auth.users u
  where u.id = v_user_fijo
     or lower(u.email) = v_email
  order by case when u.id = v_user_fijo then 0 else 1 end
  limit 1;

  if v_user_id is null then
    begin
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token, is_sso_user, is_anonymous
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_user_fijo,
        'authenticated',
        'authenticated',
        v_email,
        '$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZabcde',
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"vitrina":true}'::jsonb,
        now(),
        now(),
        '',
        '',
        '',
        '',
        false,
        false
      );
      v_user_id := v_user_fijo;
    exception
      when undefined_column then
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, confirmation_token, email_change,
          email_change_token_new, recovery_token
        ) values (
          '00000000-0000-0000-0000-000000000000',
          v_user_fijo,
          'authenticated',
          'authenticated',
          v_email,
          '$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZabcde',
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"vitrina":true}'::jsonb,
          now(),
          now(),
          '',
          '',
          '',
          ''
        );
        v_user_id := v_user_fijo;
    end;
  end if;

  begin
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    )
    select
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    where not exists (
      select 1 from auth.identities i
      where i.user_id = v_user_id and i.provider = 'email'
    );
  exception
    when others then
      null;
  end;

  select t.id into v_tienda_id
  from public.tiendas t
  where t.user_id = v_user_id
  limit 1;

  if v_tienda_id is null then
    insert into public.tiendas (
      user_id, nombre, nombre_comercial, rif, vertical,
      aprobacion_estado, bloqueado, telefono, email, latitud, longitud
    ) values (
      v_user_id, v_nombre, v_nombre, v_rif, v_vertical,
      'pendiente', false, null, null, null, null
    )
    returning id into v_tienda_id;
  end if;

  update public.tiendas
  set nombre = v_nombre,
      nombre_comercial = v_nombre,
      rif = v_rif,
      vertical = v_vertical,
      aprobacion_estado = 'pendiente',
      bloqueado = false,
      telefono = null,
      email = null,
      estado = null,
      ciudad = null,
      direccion = null,
      latitud = null,
      longitud = null,
      membresia_hasta = null
  where id = v_tienda_id;

  if coalesce(p_vaciar, false) then
    delete from public.productos as prod where prod.tienda_id = v_tienda_id;
  end if;

  tienda_id := v_tienda_id;
  user_id := v_user_id;
  return next;
end;
$$;

grant execute on function public.admin_preparar_vitrina(text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
