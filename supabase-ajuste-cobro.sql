-- Pausa de cobro: todos los aprobados siguen visibles hasta una fecha,
-- sin borrar la fecha de membresía de cada uno.
-- Ejecutar UNA VEZ en Supabase → SQL Editor.
-- Por defecto queda en cortesía hasta el 30 de junio de 2027.
-- El bloqueo manual (bloqueado = true) sigue ocultando.

create table if not exists public.ajuste_cobro (
  id int primary key check (id = 1),
  modo text not null check (modo in ('cortesia', 'pago')),
  cortesia_hasta date not null
);

insert into public.ajuste_cobro (id, modo, cortesia_hasta)
values (1, 'cortesia', date '2027-06-30')
on conflict (id) do nothing;

alter table public.ajuste_cobro enable row level security;

create or replace function public.cobro_en_cortesia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ajuste_cobro a
    where a.id = 1
      and a.modo = 'cortesia'
      and current_date <= a.cortesia_hasta
  );
$$;

grant execute on function public.cobro_en_cortesia() to anon, authenticated;

create or replace function public.admin_leer_ajuste_cobro()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  fila public.ajuste_cobro%rowtype;
begin
  if not exists (
    select 1
    from auth.users me
    where me.id = auth.uid()
      and coalesce(me.raw_app_meta_data ->> 'role', '') = 'admin'
  ) then
    raise exception 'No autorizado';
  end if;

  select * into fila from public.ajuste_cobro where id = 1;
  if not found then
    raise exception 'Falta la fila de ajuste de cobro';
  end if;

  return json_build_object(
    'modo', fila.modo,
    'cortesia_hasta', fila.cortesia_hasta,
    'cortesia_activa', public.cobro_en_cortesia()
  );
end;
$$;

grant execute on function public.admin_leer_ajuste_cobro() to authenticated;

create or replace function public.admin_set_ajuste_cobro(p_modo text)
returns json
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

  if p_modo is null or p_modo not in ('cortesia', 'pago') then
    raise exception 'Modo inválido';
  end if;

  update public.ajuste_cobro
  set modo = p_modo
  where id = 1;

  return public.admin_leer_ajuste_cobro();
end;
$$;

grant execute on function public.admin_set_ajuste_cobro(text) to authenticated;

-- El KPI de impago usa esta función. En cortesía solo cuenta el bloqueo manual.
create or replace function public.tienda_suspendida_por_impago(
  p_aprobacion_estado text,
  p_bloqueado boolean,
  p_membresia_hasta date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_aprobacion_estado, 'aprobado') = 'aprobado'
    and (
      coalesce(p_bloqueado, false) = true
      or (
        not public.cobro_en_cortesia()
        and (
          p_membresia_hasta is null
          or p_membresia_hasta < current_date
        )
      )
    );
$$;

grant execute on function public.tienda_suspendida_por_impago(text, boolean, date) to authenticated;

-- Catálogo público. Si ya existen los teléfonos extra, la vista los conserva.
do $$
declare
  con_telefonos boolean;
  sql_vista text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tiendas'
      and column_name = 'telefono_2'
  ) into con_telefonos;

  execute 'drop view if exists public.productos_publicos';
  sql_vista := $v$
    create view public.productos_publicos
    with (security_invoker = false) as
    select
      p.id,
      p.activo,
      p.aprobacion_publica,
      p.vertical,
      p.tienda_id,
      p.categoria,
      p.nombre,
      p.descripcion,
      p.comentarios,
      p.precio_usd,
      p.moneda,
      p.marca,
      p.modelo,
      p.anio,
      p.imagen_url,
      p.imagenes_extra,
      p.disponibilidad_aviso,
      p.es_oferta,
      jsonb_build_object(
        'nombre_comercial', t.nombre_comercial,
        'nombre', t.nombre,
        'rif', t.rif,
        'telefono', t.telefono,
  $v$;

  if con_telefonos then
    sql_vista := sql_vista || $v$
        'telefono_2', t.telefono_2,
        'telefono_3', t.telefono_3,
        'telefono_4', t.telefono_4,
    $v$;
  end if;

  sql_vista := sql_vista || $v$
        'direccion', t.direccion,
        'latitud', t.latitud,
        'longitud', t.longitud,
        'metodos_pago', t.metodos_pago
      ) as tiendas
    from public.productos p
    join public.tiendas t on t.id = p.tienda_id
    where p.activo = true
      and p.aprobacion_publica = 'aprobado'
      and (p.stock_actual is null or p.stock_actual > 0)
      and t.aprobacion_estado = 'aprobado'
      and coalesce(t.bloqueado, false) = false
      and (
        public.cobro_en_cortesia()
        or (t.membresia_hasta is not null and t.membresia_hasta >= current_date)
      )
  $v$;

  execute sql_vista;
end $$;

grant select on public.productos_publicos to anon, authenticated;

drop policy if exists "Publico ve tiendas con membresia activa" on public.tiendas;
create policy "Publico ve tiendas con membresia activa"
  on public.tiendas for select
  using (
    aprobacion_estado = 'aprobado'
    and coalesce(bloqueado, false) = false
    and (
      public.cobro_en_cortesia()
      or (membresia_hasta is not null and membresia_hasta >= current_date)
    )
  );

drop policy if exists "Permitir leer talleres" on public.talleres;
create policy "Permitir leer talleres"
  on public.talleres for select
  using (
    auth.uid() = user_id
    or (
      aprobacion_estado = 'aprobado'
      and coalesce(bloqueado, false) = false
      and (
        public.cobro_en_cortesia()
        or (membresia_hasta is not null and membresia_hasta >= current_date)
      )
    )
    or public.is_admin()
  );

drop policy if exists "Permitir leer gruas publicas" on public.gruas;
create policy "Permitir leer gruas publicas"
  on public.gruas for select
  using (
    auth.uid() = user_id
    or (
      aprobacion_estado = 'aprobado'
      and coalesce(bloqueado, false) = false
      and (
        public.cobro_en_cortesia()
        or membresia_hasta is null
        or membresia_hasta >= current_date
      )
    )
    or public.is_admin()
  );

notify pgrst, 'reload schema';
