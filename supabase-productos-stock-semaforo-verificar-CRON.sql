-- Verificacion despues de crear el job de Cron (pausa stock vencido).
-- Ejecuta TODO el script en Supabase SQL Editor (rol postgres).
-- Si algun SELECT falla con "relation cron.job does not exist", Cron/pg_cron no esta activo en ese proyecto.
--
-- Referencia de nombre/horario/comando del job (editala en el repo si cambias en Dashboard):
--   Ver: supabase-productos-stock-semaforo-REFERENCIA-CRON.txt
--   Job por defecto documentado: pausar_productos_stock_vencido_diario
--   Ajusta el WHERE jobname en el bloque D si usaste otro nombre.

-- A) Extension y tablas de cron
select exists(select 1 from pg_extension where extname = 'pg_cron') as extension_pg_cron;

select table_schema, table_name
from information_schema.tables
where table_schema = 'cron' and table_name in ('job', 'job_run_details')
order by table_name;

-- B) Jobs registrados (busca el tuyo por nombre)
select jobid, jobname, schedule, command, nodename, nodeport, database, username, active
from cron.job
where jobname ilike '%pausar%' or jobname ilike '%stock%'
order by jobid;

-- C) Si quieres ver TODOS los jobs (cuidado si hay muchos)
-- select jobid, jobname, schedule, active from cron.job order by jobid;

-- D) Ultimas ejecuciones del job de pausa (ajusta el nombre si lo pusiste distinto)
select
  jrd.jobid,
  j.jobname,
  jrd.runid,
  jrd.job_pid,
  jrd.database,
  jrd.username,
  jrd.command,
  jrd.status,
  jrd.return_message,
  jrd.start_time,
  jrd.end_time
from cron.job_run_details jrd
join cron.job j on j.jobid = jrd.jobid
where j.jobname = 'pausar_productos_stock_vencido_diario'
order by jrd.start_time desc
limit 20;

-- E) Si el nombre del job es otro, lista las ultimas 15 corridas de cualquier job
select
  j.jobname,
  jrd.status,
  jrd.return_message,
  jrd.start_time,
  jrd.end_time
from cron.job_run_details jrd
join cron.job j on j.jobid = jrd.jobid
order by jrd.start_time desc
limit 15;

-- F) La funcion existe y es invocable desde SQL (no prueba el Cron, solo la BD)
select proname, prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'pausar_productos_stock_vencido';

-- G) Prueba manual OPCIONAL: descomenta para ejecutar UNA vez y ver cuantos productos pauso
-- select public.pausar_productos_stock_vencido() as productos_pausados_esta_corrida;
