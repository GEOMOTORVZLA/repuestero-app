import './SelectorTipoRegistro.css';

export type TipoRegistro = 'vendedor' | 'usuario' | 'taller';

interface SelectorTipoRegistroProps {
  onSeleccionar: (tipo: TipoRegistro) => void;
  onVolver: () => void;
  onIrALogin: () => void;
}

export function SelectorTipoRegistro({ onSeleccionar, onVolver, onIrALogin }: SelectorTipoRegistroProps) {
  return (
    <div className="selector-registro">
      <div className="selector-registro-card">
        <button type="button" className="selector-registro-volver" onClick={onVolver}>
          ← Volver
        </button>
        <h2 className="selector-registro-titulo">Crear cuenta</h2>
        <p className="selector-registro-subtitulo">Elige el tipo de cuenta que deseas registrar</p>
        <div className="selector-registro-opciones">
          <button
            type="button"
            className="selector-registro-opcion"
            onClick={() => onSeleccionar('vendedor')}
          >
            <span className="selector-registro-nombre">Vendedor</span>
            <span className="selector-registro-desc">Venta de repuestos</span>
          </button>
          <button
            type="button"
            className="selector-registro-opcion"
            onClick={() => onSeleccionar('usuario')}
          >
            <span className="selector-registro-nombre">Usuario</span>
            <span className="selector-registro-desc">Compra de repuestos</span>
          </button>
          <button
            type="button"
            className="selector-registro-opcion"
            onClick={() => onSeleccionar('taller')}
          >
            <span className="selector-registro-nombre">Talleres</span>
            <span className="selector-registro-desc">Servicios automotrices</span>
          </button>
        </div>
        <p className="selector-registro-login">
          ¿Ya tienes cuenta?{' '}
          <button type="button" className="selector-registro-login-link" onClick={onIrALogin}>
            Iniciar sesión
          </button>
        </p>
      </div>
    </div>
  );
}
