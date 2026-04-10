/**
 * Iconos blancos para categorías de repuestos. Se muestran dentro de un círculo gris claro.
 * Figuras simples y representativas de cada tipo de repuesto.
 */
import type { ComponentType, SVGProps } from 'react';

const baseProps: SVGProps<SVGSVGElement> = {
  fill: 'white',
  viewBox: '0 0 64 64',
  'aria-hidden': true,
};

/** Filtro de aceite de vehículo (cilindro con base) */
export function IconoFiltro({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M32 10c-6 0-10 4-10 10v24c0 6 4 10 10 10s10-4 10-10V20c0-6-4-10-10-10zm0 4c3.3 0 6 2.7 6 6v24c0 3.3-2.7 6-6 6s-6-2.7-6-6V20c0-3.3 2.7-6 6-6z" />
      <ellipse cx="32" cy="20" rx="8" ry="4" />
      <rect x="28" y="14" width="8" height="6" rx="1" />
    </svg>
  );
}

/** Disco de frenos con caliper */
export function IconoFrenos({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <circle cx="32" cy="32" r="20" fill="none" stroke="white" strokeWidth="4" />
      <circle cx="32" cy="32" r="12" fill="none" stroke="white" strokeWidth="2" />
      <rect x="26" y="16" width="12" height="32" rx="3" />
    </svg>
  );
}

/** Batería de vehículo */
export function IconoBateria({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <rect x="16" y="20" width="32" height="24" rx="3" fill="none" stroke="white" strokeWidth="3" />
      <rect x="28" y="12" width="8" height="10" rx="1" />
      <rect x="22" y="26" width="4" height="12" rx="1" />
      <rect x="30" y="26" width="4" height="12" rx="1" />
      <rect x="38" y="26" width="4" height="12" rx="1" />
    </svg>
  );
}

/** Caucho / llanta */
export function IconoCaucho({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <circle cx="32" cy="32" r="22" fill="none" stroke="white" strokeWidth="6" />
      <circle cx="32" cy="32" r="10" fill="none" stroke="white" strokeWidth="4" />
    </svg>
  );
}

/** Amortiguador y suspensión */
export function IconoAmortiguador({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <rect x="28" y="8" width="8" height="10" rx="2" />
      <rect x="26" y="18" width="12" height="4" rx="1" />
      <path d="M30 22v20h4V22h-4zm6 0v20h4V22h-4z" />
      <rect x="24" y="42" width="16" height="6" rx="2" />
      <rect x="28" y="36" width="8" height="8" rx="1" />
    </svg>
  );
}

/** Correa automotriz */
export function IconoCorreas({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <ellipse cx="18" cy="32" rx="10" ry="6" fill="none" stroke="white" strokeWidth="4" />
      <ellipse cx="46" cy="32" rx="10" ry="6" fill="none" stroke="white" strokeWidth="4" />
      <path d="M28 26c8 0 16 6 16 6s-8 6-16 6-16-6-16-6 8-6 16-6z" fill="none" stroke="white" strokeWidth="4" />
    </svg>
  );
}

/** Bujía */
export function IconoBujias({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <rect x="26" y="14" width="12" height="16" rx="2" />
      <rect x="28" y="8" width="8" height="8" rx="1" />
      <rect x="30" y="30" width="4" height="20" rx="1" />
      <circle cx="32" cy="22" r="4" fill="none" stroke="white" strokeWidth="2" />
    </svg>
  );
}

/** Pote de aceite */
export function IconoAceite({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M20 22h24v20c0 4-4 8-12 8H32c-8 0-12-4-12-8V22z" fill="none" stroke="white" strokeWidth="2.5" />
      <path d="M22 22V18h20v4" fill="none" stroke="white" strokeWidth="2" />
      <ellipse cx="32" cy="32" rx="8" ry="4" fill="none" stroke="white" strokeWidth="2" />
    </svg>
  );
}

/** Faro */
export function IconoFaros({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M14 26l18-12 18 12v22L32 54 14 48V26z" fill="none" stroke="white" strokeWidth="2.5" />
      <circle cx="32" cy="36" r="10" fill="none" stroke="white" strokeWidth="2" />
    </svg>
  );
}

/** Disco de clutch / embrague */
export function IconoEmbrague({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <circle cx="32" cy="32" r="22" fill="none" stroke="white" strokeWidth="5" />
      <circle cx="32" cy="32" r="10" />
      <path d="M32 10v6M32 48v6M10 32h6M48 32h6" stroke="white" strokeWidth="3" fill="none" />
    </svg>
  );
}

/** Pieza genérica (categorías moto u otras sin icono dedicado) */
export function IconoRepuestoGenerico({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className}>
      <path
        d="M20 40c0-8 6-14 14-14h4c2 0 4-1.5 4-3.5S40 19 38 19h-2"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="28" cy="22" r="5" fill="none" stroke="white" strokeWidth="2.5" />
      <path d="M34 26l10 10M40 20l10 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const iconosMap: Record<string, ComponentType<{ className?: string }>> = {
  Filtros: IconoFiltro,
  Frenos: IconoFrenos,
  Baterías: IconoBateria,
  Cauchos: IconoCaucho,
  'Amortiguadores y suspensiones': IconoAmortiguador,
  'Correas y bandas': IconoCorreas,
  'Bujías y encendido': IconoBujias,
  'Aceites y lubricantes': IconoAceite,
  'Luces y faros': IconoFaros,
  Embrague: IconoEmbrague,
  Transmisión: IconoCorreas,
  Motor: IconoBujias,
  'Cauchos y tripas': IconoCaucho,
  Iluminación: IconoFaros,
};

export function IconoCategoria({ nombre, className }: { nombre: string; className?: string }) {
  const Icon = iconosMap[nombre] ?? IconoRepuestoGenerico;
  return <Icon className={className} />;
}
