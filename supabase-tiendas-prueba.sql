-- Tres vendedores (tiendas) de prueba en Caracas
-- Copia y ejecuta TODO el bloque en Supabase SQL Editor

INSERT INTO public.tiendas (nombre, nombre_comercial, rif, latitud, longitud)
VALUES
  ('Vendedor 1', 'Repuestos Vendedor 1', 'J-12345678-9', 10.4723, -66.8812),
  ('Vendedor 2', 'Repuestos Vendedor 2', 'J-23456789-0', 10.4889, -66.9201),
  ('Vendedor 3', 'Repuestos Vendedor 3', 'J-34567890-1', 10.4415, -66.8678);
