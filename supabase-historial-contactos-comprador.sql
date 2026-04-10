-- Historial de contactos a vendedores por producto (compradores). Máximo 5 filas por usuario (la app recorta; RLS permite borrar propias).

create table if not exists public.historial_contactos_producto (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  producto_id uuid references public.productos (id) on delete set null,
  producto_nombre text,
  tienda_nombre text,
  precio_texto text,
  moneda text,
  contactado_en timestamptz not null default now()
);

create index if not exists historial_contactos_producto_user_fecha_idx
  on public.historial_contactos_producto (user_id, contactado_en desc);

alter table public.historial_contactos_producto enable row level security;

drop policy if exists "comprador ve su historial de contactos" on public.historial_contactos_producto;
drop policy if exists "comprador inserta su historial de contactos" on public.historial_contactos_producto;
drop policy if exists "comprador elimina su historial de contactos" on public.historial_contactos_producto;

create policy "comprador ve su historial de contactos"
  on public.historial_contactos_producto
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "comprador inserta su historial de contactos"
  on public.historial_contactos_producto
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "comprador elimina su historial de contactos"
  on public.historial_contactos_producto
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Garantiza en DB que siempre queden solo los 5 más recientes por usuario.
-- (Aunque la app recorta también, esto evita inconsistencias por concurrencia o fallos a mitad.)
create or replace function public.mantener_ultimos_5_historial_contactos()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.historial_contactos_producto
  where user_id = new.user_id
    and id not in (
      select id
      from public.historial_contactos_producto
      where user_id = new.user_id
      order by contactado_en desc, id desc
      limit 5
    );

  return new;
end;
$$;

drop trigger if exists historial_contactos_producto_trim_ultimos_5 on public.historial_contactos_producto;

create trigger historial_contactos_producto_trim_ultimos_5
after insert on public.historial_contactos_producto
for each row
execute procedure public.mantener_ultimos_5_historial_contactos();
