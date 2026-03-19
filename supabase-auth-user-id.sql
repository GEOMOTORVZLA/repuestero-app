-- 1. Añadir columna user_id a tiendas (vincular cada tienda con el usuario)
-- Ejecuta en Supabase → SQL Editor

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Quitar políticas antiguas que permitían acceso a todos
DROP POLICY IF EXISTS "Permitir insertar tiendas" ON public.tiendas;
DROP POLICY IF EXISTS "Permitir leer tiendas" ON public.tiendas;
DROP POLICY IF EXISTS "Permitir actualizar tiendas" ON public.tiendas;
DROP POLICY IF EXISTS "Permitir eliminar tiendas" ON public.tiendas;

-- 3. Políticas nuevas: cada usuario solo ve/edita/elimina sus propias tiendas
CREATE POLICY "Usuario inserta su tienda"
  ON public.tiendas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuario ve sus tiendas"
  ON public.tiendas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuario actualiza sus tiendas"
  ON public.tiendas FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuario elimina sus tiendas"
  ON public.tiendas FOR DELETE
  USING (auth.uid() = user_id);
