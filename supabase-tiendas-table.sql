-- Ejecuta este SQL en Supabase para crear la tabla de tiendas.
-- En el dashboard: SQL Editor → New query → pega esto → Run.

create table if not exists public.tiendas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  latitud double precision not null,
  longitud double precision not null,
  created_at timestamptz default now()
);

-- Opcional: permitir que usuarios anónimos inserten (para probar sin auth).
-- Si más adelante usas autenticación, quita esto y usa RLS por usuario.
alter table public.tiendas enable row level security;

create policy "Permitir insertar tiendas"
  on public.tiendas for insert
  with check (true);

create policy "Permitir leer tiendas"
  on public.tiendas for select
  using (true);
