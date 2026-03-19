-- Políticas para poder editar y eliminar tiendas.
-- Ejecuta en Supabase → SQL Editor si te sale "permission denied" al editar o eliminar.

create policy "Permitir actualizar tiendas"
  on public.tiendas for update
  using (true)
  with check (true);

create policy "Permitir eliminar tiendas"
  on public.tiendas for delete
  using (true);
