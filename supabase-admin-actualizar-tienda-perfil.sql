-- Admin: editar perfil de tienda/vendedor (nombre, RIF, telefono, ubicacion textual, vertical, etc.).
-- Ejecutar en Supabase -> SQL Editor.
-- Requiere rol admin en app_metadata (raw_app_meta_data.role = 'admin').

create or replace function public.admin_actualizar_tienda_perfil(
  p_tienda_id uuid,
  p_nombre text,
  p_nombre_comercial text,
  p_rif text,
  p_telefono text,
  p_email text,
  p_estado text,
  p_ciudad text,
  p_vertical text,
  p_latitud double precision default null,
  p_longitud double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_vertical text;
  v_nombre text;
  v_nombre_comercial text;
  v_telefono text;
  v_lat double precision;
  v_lng double precision;
  v_perfil jsonb;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  select t.user_id, t.latitud, t.longitud
    into v_user_id, v_lat, v_lng
  from public.tiendas t
  where t.id = p_tienda_id;

  if v_user_id is null then
    raise exception 'Tienda no encontrada';
  end if;

  v_vertical := case when lower(trim(coalesce(p_vertical, ''))) = 'moto' then 'moto' else 'auto' end;
  v_nombre := nullif(trim(coalesce(p_nombre, '')), '');
  v_nombre_comercial := nullif(trim(coalesce(p_nombre_comercial, '')), '');
  v_telefono := nullif(trim(coalesce(p_telefono, '')), '');

  if coalesce(length(v_nombre), 0) < 2 and coalesce(length(v_nombre_comercial), 0) < 2 then
    raise exception 'Indica el nombre juridico o comercial (minimo 2 caracteres)';
  end if;

  if v_telefono is null
     or length(regexp_replace(v_telefono, '\D', '', 'g')) < 10
     or length(regexp_replace(v_telefono, '\D', '', 'g')) > 11
     or left(regexp_replace(v_telefono, '\D', '', 'g'), 1) <> '0' then
    raise exception 'Telefono invalido (codigo de area + 7 digitos, empezando en 0)';
  end if;

  if nullif(trim(coalesce(p_estado, '')), '') is null then
    raise exception 'Indica el estado';
  end if;

  if nullif(trim(coalesce(p_ciudad, '')), '') is null then
    raise exception 'Indica la ciudad';
  end if;

  if p_latitud is not null then
    v_lat := p_latitud;
  end if;
  if p_longitud is not null then
    v_lng := p_longitud;
  end if;

  if v_lat is not null and v_lng is not null then
    if v_lat < 0.5 or v_lat > 12.6 or v_lng < -73.4 or v_lng > -59.8 then
      raise exception 'Coordenadas fuera de Venezuela';
    end if;
    if abs(v_lat) < 0.0001 and abs(v_lng) < 0.0001 then
      raise exception 'Coordenadas invalidas (0,0)';
    end if;
  end if;

  update public.tiendas
  set
    nombre = coalesce(v_nombre, v_nombre_comercial),
    nombre_comercial = coalesce(v_nombre_comercial, v_nombre),
    rif = nullif(trim(coalesce(p_rif, '')), ''),
    telefono = v_telefono,
    email = nullif(trim(coalesce(p_email, '')), ''),
    estado = trim(p_estado),
    ciudad = trim(p_ciudad),
    vertical = v_vertical,
    latitud = v_lat,
    longitud = v_lng
  where id = p_tienda_id;

  select coalesce(u.raw_user_meta_data -> 'perfil_vendedor', '{}'::jsonb)
    into v_perfil
  from auth.users u
  where u.id = v_user_id;

  v_perfil := v_perfil
    || jsonb_build_object(
      'nombre', coalesce(v_nombre, v_nombre_comercial),
      'nombre_comercial', coalesce(v_nombre_comercial, v_nombre),
      'rif', nullif(trim(coalesce(p_rif, '')), ''),
      'telefono', v_telefono,
      'estado', trim(p_estado),
      'ciudad', trim(p_ciudad),
      'vertical', v_vertical
    );

  if v_lat is not null then
    v_perfil := v_perfil || jsonb_build_object('latitud', v_lat);
  end if;
  if v_lng is not null then
    v_perfil := v_perfil || jsonb_build_object('longitud', v_lng);
  end if;

  update auth.users
  set raw_user_meta_data =
        coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('perfil_vendedor', v_perfil)
        || jsonb_build_object('tipo_cuenta', 'vendedor')
  where id = v_user_id;
end;
$$;

grant execute on function public.admin_actualizar_tienda_perfil(
  uuid, text, text, text, text, text, text, text, text, double precision, double precision
) to authenticated;
