-- VERIFICACION CORTA v2026-03-30 (sin tablas temporales, sin cron.job)
-- Copiar TODO este archivo desde disco y ejecutar una sola vez en Supabase.

select 'columnas' as paso, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'productos'
  and column_name in ('stock_confirmado_at', 'pausado_por_stock_vencido')
order by column_name;

select 'indice' as paso, indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'productos'
  and indexname = 'productos_activo_stock_confirmado_idx';

select 'funciones' as paso, p.proname as nombre
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('productos_set_stock_confirmado_al_activar', 'pausar_productos_stock_vencido')
order by p.proname;

select 'trigger' as paso, tgname as nombre
from pg_trigger
where tgname = 'trg_productos_set_stock_confirmado_al_activar'
  and not tgisinternal;

select 'pg_cron_flags' as paso,
       exists(select 1 from pg_extension where extname = 'pg_cron') as extension_pg_cron,
       exists(
         select 1 from information_schema.tables
         where table_schema = 'cron' and table_name = 'job'
       ) as existe_tabla_cron_job;

select 'resumen_productos' as paso,
       count(*)::bigint as total,
       count(*) filter (where stock_confirmado_at is null)::bigint as sin_fecha_stock,
       count(*) filter (where coalesce(pausado_por_stock_vencido, false))::bigint as pausa_auto
from public.productos;
