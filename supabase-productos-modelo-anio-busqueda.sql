-- 1. Añadir columnas modelo y año a productos (para que la búsqueda haga match)
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS modelo text;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS anio integer;

-- 2. Permitir que clientes (y visitantes) puedan leer productos para la búsqueda
--    Sin esto, la búsqueda en la landing no mostraría resultados de otros vendedores.
--    Cada vendedor sigue pudiendo solo INSERT/UPDATE/DELETE sus propios productos.
--
-- Política para que cualquiera pueda LISTAR productos (búsqueda pública):
DROP POLICY IF EXISTS "Publico puede leer productos para busqueda" ON public.productos;
CREATE POLICY "Publico puede leer productos para busqueda"
  ON public.productos FOR SELECT
  USING (true);

-- 3. Para que en los resultados se vea el nombre de la tienda, permite leer tiendas (solo datos públicos):
DROP POLICY IF EXISTS "Publico puede leer tiendas para busqueda" ON public.tiendas;
CREATE POLICY "Publico puede leer tiendas para busqueda"
  ON public.tiendas FOR SELECT
  USING (true);

-- Los vendedores siguen pudiendo insertar/actualizar/eliminar solo sus productos y sus tiendas.
