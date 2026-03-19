-- Vendedor Toyota Demo: 1 tienda + 4 repuestos Toyota
-- Ejecuta en Supabase SQL Editor. Si falla, ejecuta cada bloque por separado.

-- Bloque 1: Columnas necesarias
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS nombre_comercial text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS rif text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS direccion text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS estado text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS ciudad text;
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS metodos_pago text[];
ALTER TABLE public.tiendas ADD COLUMN IF NOT EXISTS membresia_hasta date;

-- Bloque 2: Crear la tienda
INSERT INTO public.tiendas (
  nombre,
  nombre_comercial,
  rif,
  telefono,
  email,
  direccion,
  estado,
  ciudad,
  latitud,
  longitud,
  metodos_pago,
  membresia_hasta
) VALUES (
  'Vendedor Toyota Demo',
  'Toyota Repuestos Demo',
  'J-45678901-2',
  '0414-1234567',
  'toyota_demo@geomotor.test',
  'Av. Francisco de Miranda, Chacao, Caracas',
  'Distrito Capital',
  'Caracas',
  10.4950,
  -66.8480,
  ARRAY['Efectivo', 'Pagomovil', 'Transferencia', 'Zelle', 'Binance', 'Cashea'],
  '2026-12-31'
);

-- Bloque 3: Los 4 repuestos Toyota
INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Filtro de aceite Toyota', 'Toyota', 'Corolla', 2018, 'Filtro de aceite motor 2ZR-FE Corolla 2018', 25.00, 'USD', 10
FROM public.tiendas WHERE nombre = 'Vendedor Toyota Demo' LIMIT 1;

INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Pastillas de freno delanteras', 'Toyota', 'Hilux', 2016, 'Juego pastillas delanteras Hilux 2016', 48.50, 'USD', 6
FROM public.tiendas WHERE nombre = 'Vendedor Toyota Demo' LIMIT 1;

INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Bomba de agua', 'Toyota', 'Yaris', 2014, 'Bomba de agua motor 1.3 1.5 Yaris 2014', 72.00, 'USD', 4
FROM public.tiendas WHERE nombre = 'Vendedor Toyota Demo' LIMIT 1;

INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Amortiguador trasero', 'Toyota', 'Fortuner', 2019, 'Amortiguador trasero Fortuner 2019 suspension OEM', 95.00, 'USD', 3
FROM public.tiendas WHERE nombre = 'Vendedor Toyota Demo' LIMIT 1;
