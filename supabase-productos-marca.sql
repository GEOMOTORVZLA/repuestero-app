-- Añadir columna marca a productos (para filtrar por marca de vehículo).
-- Ejecuta en Supabase → SQL Editor si la columna no existe.

-- Añadir marca y precio si no existen
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS marca text;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS precio double precision;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'BS';

-- Opcional: si necesitas crear la tabla productos completa, usa algo como:
-- (solo si productos no existe aún; si ya existe, ignora esto)
/*
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  nombre text not null,
  codigo text,
  marca text,
  descripcion text,
  precio double precision,
  created_at timestamptz default now()
);
*/
