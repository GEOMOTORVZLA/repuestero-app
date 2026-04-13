export function mensajeWhatsappVendedorProducto(nombreProducto: string): string {
  const n = nombreProducto.trim() || 'un repuesto';
  return `Hola, te escribo desde Geomotor. Me interesa el repuesto: "${n}". ¿Sigue disponible?`;
}

export function mensajeWhatsappVendedorZona(): string {
  return 'Hola, te escribo desde Geomotor. Vi tu tienda en la zona y quiero consultarte por repuestos.';
}

export function mensajeWhatsappTaller(): string {
  return 'Hola, te escribo desde Geomotor. Vi tu taller en la plataforma y quiero consultarte.';
}

export function urlWhatsAppGeomotor(telefono: string, mensaje: string): string | null {
  const digits = telefono.replace(/\D/g, '');
  if (!digits) return null;
  const num = digits.startsWith('58') ? digits : `58${digits}`;
  const text = encodeURIComponent(mensaje.trim());
  return `https://wa.me/${num}?text=${text}`;
}
