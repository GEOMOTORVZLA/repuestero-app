-- Verificacion (solo lectura) v2026-03-30: sin tablas temporales _geomotor.
-- Si ves "drop table _geomotor" en tu pegado, es copia vieja: abre de nuevo el archivo en disco.
-- Ejecuta todo el archivo y revisa cada resultado en el SQL Editor.

-- 1) Columnas en public.productos
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'productos'
  and column_name in ('stock_confirmado_at', 'pausado_por_stock_vencido')
order by column_name;

-- 2) Indice
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'productos'
  and indexname = 'productos_activo_stock_confirmado_idx';

-- 3) Funciones
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'productos_set_stock_confirmado_al_activar',
    'pausar_productos_stock_vencido'
  )
order by p.proname;

-- 4) Trigger en productos
select tgname as trigger_name,
       tgrelid::regclass as on_table,
       tgenabled as enabled
from pg_trigger
where tgname = 'trg_productos_set_stock_confirmado_al_activar'
  and not tgisinternal;

-- 5) Permisos sobre pausar_productos_stock_vencido
--    (no deberia aparecer grant a authenticated / anon para EXECUTE si aplicaste los revoke)
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'pausar_productos_stock_vencido'
order by grantee, privilege_type;

-- 6) pg_cron: solo flags (no lee cron.job; no rompe si no hay extension).
-- Si las dos columnas salen true, ejecuta aparte (solo esa linea):
-- select jobid, jobname, schedule, command, active from cron.job where jobname = 'pausar_productos_stock_vencido_diario';
select exists(select 1 from pg_extension where extname = 'pg_cron') as extension_pg_cron,
       exists(
         select 1
         from information_schema.tables
         where table_schema = 'cron'
           and table_name = 'job'
       ) as existe_tabla_cron_job;

-- 7) Resumen de datos (sanidad)
select
  count(*)::bigint as total_productos,
  count(*) filter (where stock_confirmado_at is null)::bigint as sin_stock_confirmado_at,
  count(*) filter (where coalesce(pausado_por_stock_vencido, false))::bigint as marcados_pausa_automatica,
  count(*) filter (
    where coalesce(activo, true)
      and coalesce(stock_confirmado_at, created_at, now()) <= (now() - interval '20 days')
  )::bigint as activos_con_stock_vencido_20d
from public.productos;
