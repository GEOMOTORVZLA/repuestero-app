import { esTelefonoVenezuelaValido, esRestoTelefonoValido } from './validarDatosNegocio';
import { urlWhatsAppGeomotor } from './linkWhatsAppGeomotor';

export type TelefonosNegocio = {
  telefono?: string | null;
  telefono_2?: string | null;
  telefono_3?: string | null;
  telefono_4?: string | null;
};

export type ContactoWhatsapp = {
  etiqueta: string;
  numeroVisible: string;
  href: string;
};

function digitos(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}

export function formatearTelefonoVisible(telefono: string): string {
  const d = digitos(telefono);
  if (d.length <= 7) return d;
  return `${d.slice(0, d.length - 7)}-${d.slice(-7)}`;
}

/** Teléfonos 2 a 4. Vacío se ignora. Si hay dígitos, tienen que completar el número. */
export function mensajeTelefonosAdicionales(
  principal: string | null | undefined,
  adicionales: Array<string | null | undefined>
): string | null {
  const base = digitos(principal);
  for (let i = 0; i < adicionales.length; i += 1) {
    const d = digitos(adicionales[i]);
    if (!d) continue;
    if (!esTelefonoVenezuelaValido(d)) {
      return `El teléfono ${i + 2} debe tener código de área y 7 dígitos, o déjalo vacío.`;
    }
  }

  const todos = [base, ...adicionales.map((v) => digitos(v))].filter(Boolean);
  const unicos = new Set(todos);
  if (unicos.size !== todos.length) {
    return 'No repitas el mismo teléfono.';
  }
  return null;
}

export function mensajeRestoTelefonoOpcional(resto: string, numeroCampo: number): string | null {
  const d = digitos(resto);
  if (!d) return null;
  if (!esRestoTelefonoValido(d)) {
    return `El teléfono ${numeroCampo} debe tener 7 dígitos, o déjalo vacío.`;
  }
  return null;
}

export function camposTelefonosAdicionales(
  numeros: Array<string | null | undefined>
): { telefono_2: string | null; telefono_3: string | null; telefono_4: string | null } {
  const limpio = (valor: string | null | undefined) => {
    const d = digitos(valor);
    return d ? d : null;
  };
  return {
    telefono_2: limpio(numeros[0]),
    telefono_3: limpio(numeros[1]),
    telefono_4: limpio(numeros[2]),
  };
}

export function listaContactosWhatsapp(
  prefijo: string,
  fuente: TelefonosNegocio,
  mensaje: string
): ContactoWhatsapp[] {
  const crudos = [fuente.telefono, fuente.telefono_2, fuente.telefono_3, fuente.telefono_4];
  const vistos = new Set<string>();
  const lista: ContactoWhatsapp[] = [];
  for (const raw of crudos) {
    const d = digitos(raw);
    if (!d || vistos.has(d)) continue;
    if (!esTelefonoVenezuelaValido(d)) continue;
    const href = urlWhatsAppGeomotor(d, mensaje);
    if (!href) continue;
    vistos.add(d);
    lista.push({
      etiqueta: `${prefijo} ${lista.length + 1}`,
      numeroVisible: formatearTelefonoVisible(d),
      href,
    });
  }
  return lista;
}
