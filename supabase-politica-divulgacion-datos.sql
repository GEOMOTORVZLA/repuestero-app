-- Politica de divulgacion de datos (registro vendedor / taller).
-- Ejecuta en Supabase SQL Editor.

alter table public.tiendas
  add column if not exists politica_divulgacion_aceptada boolean not null default false;

alter table public.tiendas
  add column if not exists politica_divulgacion_version text;

alter table public.tiendas
  add column if not exists politica_divulgacion_aceptada_en timestamptz;

alter table public.talleres
  add column if not exists politica_divulgacion_aceptada boolean not null default false;

alter table public.talleres
  add column if not exists politica_divulgacion_version text;

alter table public.talleres
  add column if not exists politica_divulgacion_aceptada_en timestamptz;
