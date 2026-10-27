import { useMemo } from 'react';
import { CODIGOS_AREA_FIJO, CODIGOS_TELEFONO } from '../data/registroVenezuela';

export type TelefonoFormulario = {
  esFijo: boolean;
  codigo: string;
  resto: string;
};

export function telefonoFormularioVacio(): TelefonoFormulario {
  return { esFijo: false, codigo: CODIGOS_TELEFONO[0].codigo, resto: '' };
}

export function telefonoCompletoDesdeFormulario(t: TelefonoFormulario): string | null {
  const resto = t.resto.replace(/\D/g, '');
  if (!resto) return null;
  return `${t.codigo}${resto}`;
}

type Props = {
  idPrefix: string;
  etiqueta: string;
  obligatorio?: boolean;
  valor: TelefonoFormulario;
  onChange: (valor: TelefonoFormulario) => void;
  disabled?: boolean;
  onFocusNumero?: (el: HTMLInputElement) => void;
};

/** Mismo bloque del registro: móvil o fijo, código y 7 dígitos, en columna en el celular. */
export function BloqueTelefonoRegistro({
  idPrefix,
  etiqueta,
  obligatorio = false,
  valor,
  onChange,
  disabled = false,
  onFocusNumero,
}: Props) {
  const codigos = valor.esFijo ? CODIGOS_AREA_FIJO : CODIGOS_TELEFONO;
  const etiquetaCodigo = useMemo(() => {
    if (valor.esFijo) return CODIGOS_AREA_FIJO.find((c) => c.codigo === valor.codigo)?.ciudad ?? '';
    return CODIGOS_TELEFONO.find((c) => c.codigo === valor.codigo)?.compania ?? '';
  }, [valor.codigo, valor.esFijo]);
  const vista = valor.resto.length > 0 ? `${valor.codigo}-${valor.resto}` : '';
  const previewId = `${idPrefix}-preview`;

  return (
    <div className="form-registro-campo form-registro-telefono">
      <label htmlFor={`${idPrefix}-numero`}>
        {etiqueta}
        {obligatorio ? ' *' : ''}
      </label>
      <div className="form-registro-telefono-tipo">
        <button
          type="button"
          className={!valor.esFijo ? 'activo' : ''}
          disabled={disabled}
          onClick={() =>
            onChange({ esFijo: false, codigo: CODIGOS_TELEFONO[0].codigo, resto: valor.resto })
          }
        >
          Móvil
        </button>
        <button
          type="button"
          className={valor.esFijo ? 'activo' : ''}
          disabled={disabled}
          onClick={() =>
            onChange({ esFijo: true, codigo: CODIGOS_AREA_FIJO[0].codigo, resto: valor.resto })
          }
        >
          Fijo
        </button>
      </div>
      <div className="form-registro-telefono-inputs">
        <div className="form-registro-telefono-codigo-wrap">
          <label htmlFor={`${idPrefix}-codigo`} className="form-registro-telefono-sublabel">
            Código de área
          </label>
          <select
            id={`${idPrefix}-codigo`}
            value={valor.codigo}
            onChange={(e) => onChange({ ...valor, codigo: e.target.value })}
            disabled={disabled}
            aria-label="Código de área telefónico"
          >
            {codigos.map(({ codigo }) => (
              <option key={codigo} value={codigo}>
                {codigo}
              </option>
            ))}
          </select>
          {etiquetaCodigo ? (
            <p className="form-registro-telefono-codigo-hint">
              {valor.esFijo ? `Ciudad: ${etiquetaCodigo}` : etiquetaCodigo}
            </p>
          ) : null}
        </div>
        <div className="form-registro-telefono-numero-wrap">
          <label htmlFor={`${idPrefix}-numero`} className="form-registro-telefono-sublabel">
            Número (7 dígitos)
          </label>
          <input
            id={`${idPrefix}-numero`}
            className="form-registro-telefono-numero"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={valor.resto}
            onChange={(e) =>
              onChange({ ...valor, resto: e.target.value.replace(/\D/g, '').slice(0, 7) })
            }
            onFocus={(e) => onFocusNumero?.(e.currentTarget)}
            placeholder="1234567"
            maxLength={7}
            disabled={disabled}
            aria-describedby={vista ? previewId : undefined}
          />
        </div>
      </div>
      {vista ? (
        <p id={previewId} className="form-registro-telefono-preview" aria-live="polite">
          Número completo: <strong>{vista}</strong>
        </p>
      ) : (
        <p className="form-registro-telefono-preview form-registro-telefono-preview--vacio">
          {obligatorio
            ? 'Escribe los 7 dígitos después del código de área.'
            : 'Opcional. Si lo usas, escribe los 7 dígitos.'}
        </p>
      )}
    </div>
  );
}
