-- Tres talleres de prueba en Caracas
-- Ejecuta en Supabase → SQL Editor (después de supabase-membresia-fee.sql si usas membresía)

INSERT INTO public.talleres (
  nombre,
  nombre_comercial,
  especialidad,
  estado,
  ciudad,
  telefono,
  email,
  direccion,
  latitud,
  longitud,
  membresia_hasta
) VALUES
(
  'Taller Uno',
  'Taller Uno - Mecánica General',
  'Mecánica Ligera',
  'Distrito Capital',
  'Caracas',
  '0412-5551234',
  'taller1@geomotor.test',
  'Av. Principal de La Castellana, Torre BBVA, PB, Caracas',
  10.4806,
  -66.9036,
  '2026-12-31'
),
(
  'Taller Dos',
  'Taller Dos - Frenos y Suspensión',
  'Frenos',
  'Distrito Capital',
  'Caracas',
  '0414-5555678',
  'taller2@geomotor.test',
  'Calle Comercio con Av. Fuerzas Armadas, Edificio Don Gregorio, Local 3, Caracas',
  10.5012,
  -66.8477,
  '2026-12-31'
),
(
  'Taller Tres',
  'Taller Tres - Sistema Eléctrico',
  'Electroauto',
  'Distrito Capital',
  'Caracas',
  '0416-5559012',
  'taller3@geomotor.test',
  'Av. Sucre de Catia, Centro Comercial Catia, Nivel 2, Caracas',
  10.4598,
  -66.9345,
  '2026-12-31'
);
