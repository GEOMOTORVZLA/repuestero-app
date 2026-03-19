-- 2 repuestos por cada vendedor (Vendedor 1, 2, 3) para pruebas
-- Ejecuta en Supabase → SQL Editor

-- Vendedor 1: Toyota Corolla 2018 + Chevrolet Aveo 2015
INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Filtro de aceite', 'Toyota', 'Corolla', 2018, 'Filtro de aceite para motor 2ZR-FE. Original o compatible.', 28.50, 'USD', 5
FROM public.tiendas WHERE nombre = 'Vendedor 1' LIMIT 1;

INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Pastillas de freno delanteras', 'Chevrolet', 'Aveo', 2015, 'Juego de pastillas delanteras. Incluye sensores.', 45.00, 'USD', 3
FROM public.tiendas WHERE nombre = 'Vendedor 1' LIMIT 1;

-- Vendedor 2: Nissan Versa 2020 + Hyundai Accent 2012
INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Bujía de encendido', 'Nissan', 'Versa', 2020, 'Bujía iridium. Set x4 unidades.', 32.00, 'USD', 8
FROM public.tiendas WHERE nombre = 'Vendedor 2' LIMIT 1;

INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Correa de distribución', 'Hyundai', 'Accent', 2012, 'Kit correa + tensor. Motor 1.6 GDI.', 85.00, 'USD', 2
FROM public.tiendas WHERE nombre = 'Vendedor 2' LIMIT 1;

-- Vendedor 3: Ford Ranger 2019 + Renault Sandero 2017
INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Filtro de aire de cabina', 'Ford', 'Ranger', 2019, 'Filtro de polen/carbón activado.', 18.00, 'USD', 6
FROM public.tiendas WHERE nombre = 'Vendedor 3' LIMIT 1;

INSERT INTO public.productos (tienda_id, nombre, marca, modelo, anio, descripcion, precio_usd, moneda, stock_actual)
SELECT id, 'Amortiguador delantero', 'Renault', 'Sandero', 2017, 'Amortiguador delantero derecho. Original o reemplazo.', 65.00, 'USD', 4
FROM public.tiendas WHERE nombre = 'Vendedor 3' LIMIT 1;
