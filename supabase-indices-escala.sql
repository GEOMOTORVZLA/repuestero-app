-- Indices y extensiones para escalar Geomotor (plan Pro).
-- Ejecutar UNA VEZ en Supabase -> SQL Editor (produccion).
-- Seguro: solo CREATE INDEX IF NOT EXISTS / extension; no altera datos ni RLS.
--
-- Mejora: busquedas ILIKE en productos, filtros publicos, mapa y talleres.
-- Tras ejecutar, revisa Database -> Query performance en picos de trafico.

-- 1) Extension para acelerar ILIKE %termino% (BusquedaRepuestos, sugerencias)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) PRODUCTOS: listados publicos y joins por tienda
CREATE INDEX IF NOT EXISTS idx_productos_tienda_id
  ON public.productos (tienda_id);

CREATE INDEX IF NOT EXISTS idx_productos_publico_listado
  ON public.productos (vertical, activo, aprobacion_publica, nombre, id)
  WHERE activo = true AND aprobacion_publica = 'aprobado';

CREATE INDEX IF NOT EXISTS idx_productos_categoria_publico
  ON public.productos (vertical, categoria, activo, aprobacion_publica)
  WHERE activo = true AND aprobacion_publica = 'aprobado';

CREATE INDEX IF NOT EXISTS idx_productos_aprobacion_publica
  ON public.productos (aprobacion_publica)
  WHERE aprobacion_publica = 'pendiente';

-- Trigram en columnas de busqueda de texto (OR ilike en el cliente)
CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm
  ON public.productos USING gin (nombre gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_productos_descripcion_trgm
  ON public.productos USING gin (descripcion gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_productos_comentarios_trgm
  ON public.productos USING gin (comentarios gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_productos_marca_trgm
  ON public.productos USING gin (marca gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_productos_modelo_trgm
  ON public.productos USING gin (modelo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_productos_categoria_trgm
  ON public.productos USING gin (categoria gin_trgm_ops);

-- 3) TIENDAS: vendedores publicos y filtros estado/ciudad
CREATE INDEX IF NOT EXISTS idx_tiendas_publico_vertical
  ON public.tiendas (vertical, aprobacion_estado, membresia_hasta)
  WHERE aprobacion_estado = 'aprobado' AND coalesce(bloqueado, false) = false;

CREATE INDEX IF NOT EXISTS idx_tiendas_vertical_estado_ciudad
  ON public.tiendas (vertical, estado, ciudad);

CREATE INDEX IF NOT EXISTS idx_tiendas_user_id
  ON public.tiendas (user_id);

-- 4) TALLERES: busqueda por estado/ciudad y especialidad (array)
CREATE INDEX IF NOT EXISTS idx_talleres_busqueda_geo
  ON public.talleres (vertical, estado, ciudad);

CREATE INDEX IF NOT EXISTS idx_talleres_especialidad_gin
  ON public.talleres USING gin (especialidad);

CREATE INDEX IF NOT EXISTS idx_talleres_user_id
  ON public.talleres (user_id);

CREATE INDEX IF NOT EXISTS idx_talleres_mapa_coords
  ON public.talleres (vertical, latitud, longitud)
  WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tiendas_mapa_coords
  ON public.tiendas (vertical, latitud, longitud)
  WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

-- 5) Analizar estadisticas (ayuda al planificador tras crear indices)
ANALYZE public.productos;
ANALYZE public.tiendas;
ANALYZE public.talleres;