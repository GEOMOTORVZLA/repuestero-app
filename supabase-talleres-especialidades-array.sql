-- Ejecuta en Supabase SQL Editor: especialidad pasa de un solo texto a varias (text[]).
-- Permite que el taller marque todas las especialidades que ofrece (como metodos_pago).

ALTER TABLE public.talleres
  ALTER COLUMN especialidad DROP NOT NULL;

ALTER TABLE public.talleres
  ALTER COLUMN especialidad TYPE text[] USING (
    CASE
      WHEN especialidad IS NULL THEN ARRAY[]::text[]
      WHEN trim(especialidad::text) = '' THEN ARRAY[]::text[]
      ELSE ARRAY[trim(especialidad::text)]
    END
  );

ALTER TABLE public.talleres
  ALTER COLUMN especialidad SET DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.talleres.especialidad IS 'Una o más especialidades del taller (lista del registro).';
