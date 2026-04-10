-- Control de vigencia de stock para productos
-- Ejecutar en Supabase SQL Editor

alter table public.productos
  add column if not exists stock_confirmado_at timestamptz,
  add column if not exists pausado_por_stock_vencido boolean not null default false;

-- Backfill inicial para no dejar productos sin referencia temporal de stock
update public.productos
set stock_confirmado_at = coalesce(stock_confirmado_at, created_at, now())
where stock_confirmado_at is null;

create index if not exists productos_activo_stock_confirmado_idx
  on public.productos (activo, stock_confirmado_at);

comment on column public.productos.stock_confirmado_at is
  'Última fecha de confirmación de stock por el vendedor (o por alta/importación).';
comment on column public.productos.pausado_por_stock_vencido is
  'true cuando el sistema pausó automáticamente el producto por vencer la vigencia de stock.';

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

-- No otorgar esta función a "authenticated": cualquier sesión podría disparar pausa masiva vía RPC.
-- El cron de Supabase y el SQL Editor (rol postgres) pueden ejecutarla sin este grant explícito.
revoke all on function public.pausar_productos_stock_vencido() from public;
revoke all on function public.pausar_productos_stock_vencido() from authenticated;
revoke all on function public.pausar_productos_stock_vencido() from anon;

/* Cron diario si la extension pg_cron existe. Delimitadores cron y cmd para no mezclar con el bloque DO. */
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1
      from cron.job
      where jobname = 'pausar_productos_stock_vencido_diario'
    ) then
      perform cron.schedule(
        'pausar_productos_stock_vencido_diario',
        '15 2 * * *',
        $cmd$select public.pausar_productos_stock_vencido();$cmd$
      );
    end if;
  end if;
exception
  when others then
    raise notice 'No se pudo registrar cron automático: %', sqlerrm;
end
$cron$;
