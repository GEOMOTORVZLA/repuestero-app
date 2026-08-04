-- Extiende la pausa automatica por stock sin confirmar: 20 dias -> 60 dias.
-- Ejecutar en Supabase SQL Editor (una vez). El job de cron existente sigue
-- llamando a pausar_productos_stock_vencido(); solo cambia el intervalo.

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
    and coalesce(p.stock_confirmado_at, p.created_at, now()) <= (now() - interval '60 days');

  get diagnostics v_actualizados = row_count;
  return v_actualizados;
end;
$pausar$;

comment on function public.pausar_productos_stock_vencido() is
  'Pausa productos activos sin confirmacion de stock en 60 dias o mas. Llamada por cron diario.';

revoke all on function public.pausar_productos_stock_vencido() from public;
revoke all on function public.pausar_productos_stock_vencido() from authenticated;
revoke all on function public.pausar_productos_stock_vencido() from anon;

-- Opcional: comprobar cuantos activos ya superan 60 dias (no los pausa esta consulta)
-- select count(*) as activos_mas_de_60d
-- from public.productos p
-- where coalesce(p.activo, true) = true
--   and coalesce(p.stock_confirmado_at, p.created_at, now()) <= (now() - interval '60 days');