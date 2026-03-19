-- Contactos y métricas de interacción
-- Ejecutar en Supabase → SQL Editor

create table if not exists public.contactos_productos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  producto_id uuid not null references public.productos(id) on delete cascade,
  tienda_id uuid null references public.tiendas(id) on delete set null,

  tipo_contacto text not null, -- ej: 'contactar_modal', 'whatsapp', 'ver_ruta', 'abrir_google_maps'
  origen text null,            -- ej: 'busqueda_repuestos', 'categorias_mas_buscadas', etc.

  ip_cliente text null,
  user_agent text null
);

create index if not exists contactos_productos_producto_id_idx
  on public.contactos_productos (producto_id);

create index if not exists contactos_productos_tienda_id_idx
  on public.contactos_productos (tienda_id);

create index if not exists contactos_productos_created_at_idx
  on public.contactos_productos (created_at);


create table if not exists public.contactos_talleres (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  taller_id uuid not null references public.talleres(id) on delete cascade,

  tipo_contacto text not null, -- ej: 'contactar_modal', 'whatsapp', 'ver_ruta', 'abrir_google_maps'
  origen text null,            -- ej: 'busqueda_talleres'

  ip_cliente text null,
  user_agent text null
);

create index if not exists contactos_talleres_taller_id_idx
  on public.contactos_talleres (taller_id);

create index if not exists contactos_talleres_created_at_idx
  on public.contactos_talleres (created_at);

