-- Asignar teléfono, email y dirección a los 3 vendedores de prueba
-- Ejecuta en Supabase → SQL Editor

-- Añadir columna direccion a tiendas si no existe
ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS direccion text;

-- Actualizar Vendedor 1
UPDATE public.tiendas
SET telefono = '0412-5551234', email = 'vendedor1@geomotor.test', direccion = 'Av. Principal de La Castellana, Torre BBVA, PB, Caracas'
WHERE nombre = 'Vendedor 1';

-- Actualizar Vendedor 2
UPDATE public.tiendas
SET telefono = '0414-5555678', email = 'vendedor2@geomotor.test', direccion = 'Calle Comercio con Av. Fuerzas Armadas, Local 3, Caracas'
WHERE nombre = 'Vendedor 2';

-- Actualizar Vendedor 3
UPDATE public.tiendas
SET telefono = '0416-5559012', email = 'vendedor3@geomotor.test', direccion = 'Av. Sucre de Catia, Centro Comercial Catia, Nivel 2, Caracas'
WHERE nombre = 'Vendedor 3';
