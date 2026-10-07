-- Directorio de grúas / emergencias viales.
-- Ejecutar en Supabase → SQL Editor (no forma parte del deploy de Vercel).

create table if not exists public.gruas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  nombre text not null,
  nombre_comercial text,
  rif text,
  tipos text[] not null default '{}',
  servicio_24h boolean not null default false,
  auxilio_vial boolean not null default false,
  estado text,
  ciudad text,
  telefono text,
  email text,
  direccion text,
  latitud double precision,
  longitud double precision,
  acerca_de text,
  aprobacion_estado text not null default 'pendiente',
  bloqueado boolean not null default false,
  membresia_hasta date,
  created_at timestamptz not null default now()
);

create unique index if not exists gruas_rif_unico
  on public.gruas (rif)
  where rif is not null and btrim(rif) <> '';

create index if not exists gruas_estado_ciudad_idx on public.gruas (estado, ciudad);
create index if not exists gruas_tipos_idx on public.gruas using gin (tipos);

alter table public.gruas enable row level security;

drop policy if exists "Permitir leer gruas publicas" on public.gruas;
create policy "Permitir leer gruas publicas"
  on public.gruas for select
  using (
    aprobacion_estado = 'aprobado'
    and coalesce(bloqueado, false) = false
    and (membresia_hasta is null or membresia_hasta >= current_date)
  );

drop policy if exists "Permitir insertar grua propia" on public.gruas;
create policy "Permitir insertar grua propia"
  on public.gruas for insert
  with check (auth.uid() = user_id);

drop policy if exists "Permitir actualizar grua propia" on public.gruas;
create policy "Permitir actualizar grua propia"
  on public.gruas for update
  using (auth.uid() = user_id);

comment on table public.gruas is 'Operadores de grúa y auxilio vial; independiente de talleres.';

alter table public.gruas add column if not exists tipo_persona text;
alter table public.gruas add column if not exists metodos_pago text[];
alter table public.gruas add column if not exists politica_divulgacion_aceptada boolean;
alter table public.gruas add column if not exists politica_divulgacion_version text;
alter table public.gruas add column if not exists politica_divulgacion_aceptada_en timestamptz;

create unique index if not exists gruas_user_id_unico
  on public.gruas (user_id)
  where user_id is not null;

drop policy if exists "grua ve su fila" on public.gruas;
create policy "grua ve su fila"
  on public.gruas for select
  using (auth.uid() = user_id);
