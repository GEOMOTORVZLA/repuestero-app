-- Paso 2 (opcional): registrar job en pg_cron.
-- Ejecutar solo despues del paso 1. Si falla por permisos, agenda el job desde el panel de Supabase.
-- Nombre/horario/comando canonicos del equipo: supabase-productos-stock-semaforo-REFERENCIA-CRON.txt

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
    raise notice 'No se pudo registrar cron: %', sqlerrm;
end
$cron$;
