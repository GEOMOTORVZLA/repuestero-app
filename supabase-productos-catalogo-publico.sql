-- Catálogo público sin código ni cantidad.
-- Ejecutar en Supabase → SQL Editor en el mismo momento en que se publica
-- la versión de la web que lee productos_publicos.
--
-- La vista corre como dueño (security_invoker = false) y repite el filtro
-- que antes hacía la política pública. Así el visitante no lee la tabla.
-- El vendedor y el admin siguen leyendo public.productos con sus políticas.

DROP VIEW IF EXISTS public.productos_publicos;

CREATE VIEW public.productos_publicos
WITH (security_invoker = false) AS
SELECT
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
  ) AS tiendas
FROM public.productos p
JOIN public.tiendas t ON t.id = p.tienda_id
WHERE p.activo = true
  AND p.aprobacion_publica = 'aprobado'
  AND (p.stock_actual IS NULL OR p.stock_actual > 0)
  AND t.aprobacion_estado = 'aprobado'
  AND coalesce(t.bloqueado, false) = false
  AND t.membresia_hasta IS NOT NULL
  AND t.membresia_hasta >= CURRENT_DATE;

COMMENT ON VIEW public.productos_publicos IS
  'Catálogo visible en la búsqueda. Sin codigo ni stock_actual.';

GRANT SELECT ON public.productos_publicos TO anon, authenticated;

-- Cierra la lectura pública de la fila completa (codigo, stock y el resto).
DROP POLICY IF EXISTS "Publico puede leer productos para busqueda" ON public.productos;
DROP POLICY IF EXISTS "Publico ve productos aprobados" ON public.productos;

NOTIFY pgrst, 'reload schema';
