-- Paso 1: columnas, backfill, indice, trigger y funcion de pausa.
-- Ejecutar este archivo entero en Supabase SQL Editor (Run, sin pegar desde el chat).

alter table public.productos
  add column if not exists stock_confirmado_at timestamptz,
  add column if not exists pausado_por_stock_vencido boolean not null default false;

update public.productos
set stock_confirmado_at = coalesce(stock_confirmado_at, created_at, now())
where stock_confirmado_at is null;

create index if not exists productos_activo_stock_confirmado_idx
  on public.productos (activo, stock_confirmado_at);

comment on column public.productos.stock_confirmado_at is
  'Ultima fecha de confirmacion de stock (alta, import o reactivacion).';
comment on column public.productos.pausado_por_stock_vencido is
  'true si el sistema pauso el producto por vencer la vigencia de stock.';

create or replace function public.productos_set_stock_confirmado_al_activar()
returns trigger
language plpgsql
as $trg$
begin
  if new.activo = true and coalesce(old.activo, false) = false then
    new.stock_confirmado_at := now();
    new.pausado_por_stock_vencido := false;
  end if;
  return new;
end;
$trg$;

drop trigger if exists trg_productos_set_stock_confirmado_al_activar on public.productos;
create trigger trg_productos_set_stock_confirmado_al_activar
before update of activo on public.productos
for each row
execute function public.productos_set_stock_confirmado_al_activar();

create or replace function public.pausar_productos_stock_vencido()
returns integer
language plpgsql
security definer
set search_path = public
as $pausar$
declare
  v_actualizados integer;
begin
  update public.productos p
  set
    activo = false,
    pausado_por_stock_vencido = true
  where
    coalesce(p.activo, true) = true
    and coalesce(p.stock_confirmado_at, p.created_at, now()) <= (now() - interval '20 days');

  get diagnostics v_actualizados = row_count;
  return v_actualizados;
end;
$pausar$;

revoke all on function public.pausar_productos_stock_vencido() from public;
revoke all on function public.pausar_productos_stock_vencido() from authenticated;
revoke all on function public.pausar_productos_stock_vencido() from anon;
