-- Hasta 4 teléfonos para vendedor, taller y grúa.
-- Ejecutar en Supabase → SQL Editor antes de usar el formulario nuevo.
-- No cambia políticas: las columnas nuevas siguen la misma fila.

alter table public.tiendas
  add column if not exists telefono_2 text,
  add column if not exists telefono_3 text,
  add column if not exists telefono_4 text;

alter table public.talleres
  add column if not exists telefono_2 text,
  add column if not exists telefono_3 text,
  add column if not exists telefono_4 text;

alter table public.gruas
  add column if not exists telefono_2 text,
  add column if not exists telefono_3 text,
  add column if not exists telefono_4 text;

drop view if exists public.productos_publicos;

create view public.productos_publicos
with (security_invoker = false) as
select
  p.id,
  p.activo,
  p.aprobacion_publica,
  p.vertical,
  p.tienda_id,
  p.categoria,
  p.nombre,
  p.descripcion,
  p.comentarios,
  p.precio_usd,
  p.moneda,
  p.marca,
  p.modelo,
  p.anio,
  p.imagen_url,
  p.imagenes_extra,
  p.disponibilidad_aviso,
  p.es_oferta,
  jsonb_build_object(
    'nombre_comercial', t.nombre_comercial,
    'nombre', t.nombre,
    'rif', t.rif,
    'telefono', t.telefono,
    'telefono_2', t.telefono_2,
    'telefono_3', t.telefono_3,
    'telefono_4', t.telefono_4,
    'direccion', t.direccion,
    'latitud', t.latitud,
    'longitud', t.longitud,
    'metodos_pago', t.metodos_pago
  ) as tiendas
from public.productos p
join public.tiendas t on t.id = p.tienda_id
where p.activo = true
  and p.aprobacion_publica = 'aprobado'
  and (p.stock_actual is null or p.stock_actual > 0)
  and t.aprobacion_estado = 'aprobado'
  and coalesce(t.bloqueado, false) = false
  and t.membresia_hasta is not null
  and t.membresia_hasta >= current_date;

comment on view public.productos_publicos is
  'Catálogo visible en la búsqueda. Sin codigo ni stock_actual.';

grant select on public.productos_publicos to anon, authenticated;

notify pgrst, 'reload schema';
