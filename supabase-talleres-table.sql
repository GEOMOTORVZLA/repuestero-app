-- Ejecuta este SQL en Supabase para crear la tabla de talleres.
-- En el dashboard: SQL Editor → New query → pega esto → Run.

create table if not exists public.talleres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  nombre text not null,
  nombre_comercial text,
  especialidad text not null,
  estado text,
  ciudad text,
  telefono text,
  email text,
  direccion text,
  latitud double precision,
  longitud double precision,
  created_at timestamptz default now()
);

alter table public.talleres enable row level security;

-- Los talleres son visibles para todos (búsqueda pública)
create policy "Permitir leer talleres"
  on public.talleres for select
  using (true);

-- Solo el dueño puede insertar/actualizar/eliminar su taller
create policy "Permitir insertar taller propio"
  on public.talleres for insert
  with check (auth.uid() = user_id);

create policy "Permitir actualizar taller propio"
  on public.talleres for update
  using (auth.uid() = user_id);

create policy "Permitir eliminar taller propio"
  on public.talleres for delete
  using (auth.uid() = user_id);
