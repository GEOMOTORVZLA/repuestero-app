import { Link } from 'react-router-dom';
import './PoliticaDivulgacionDatos.css';

const raw = import.meta.env.VITE_POLITICA_DIVULGACION_DOC_URL;
const DOC_URL = typeof raw === 'string' ? raw.trim() : '';

export function PoliticaDivulgacionDatos() {
  return (
    <div className="politica-divulgacion">
      <header className="politica-divulgacion-barra">
        <Link to="/" className="politica-divulgacion-volver">
          Volver al inicio
        </Link>
        <p className="politica-divulgacion-meta">GEOMOTOR · Términos y datos</p>
      </header>

      <article className="politica-divulgacion-doc">
        <div className="politica-divulgacion-hoja">
          <h1 className="politica-divulgacion-titulo">
            Términos y condiciones de uso y autorización para el tratamiento de datos personales
          </h1>
          <p className="politica-divulgacion-subtitulo">
            El presente documento establece los términos bajo los cuales GEOMOTOR (en adelante, &quot;La
            Plataforma&quot;) recolecta, almacena y utiliza la información de los usuarios que se registran
            como vendedores o comercios.
          </p>

          <h2 className="politica-divulgacion-h2">1. Objeto</h2>
          <p className="politica-divulgacion-p">
            Al marcar la casilla de aceptación, el Usuario otorga su consentimiento expreso, libre, informado
            y específico para que sus datos de contacto y la información de su inventario sean publicados en
            el portal web y aplicaciones de La Plataforma.
          </p>

          <h2 className="politica-divulgacion-h2">2. Datos objeto de divulgación</h2>
          <p className="politica-divulgacion-p">
            La Plataforma publicará, con el fin de facilitar la conexión entre vendedores y compradores, los
            siguientes datos:
          </p>
          <ul className="politica-divulgacion-lista">
            <li>Nombre del establecimiento o razón social.</li>
            <li>Ubicación geográfica exacta (geolocalización).</li>
            <li>Números de contacto telefónico y enlaces directos a servicios de mensajería (WhatsApp).</li>
            <li>Imágenes y precios de los productos cargados por el Usuario.</li>
          </ul>

          <h2 className="politica-divulgacion-h2">3. Finalidad</h2>
          <p className="politica-divulgacion-p">
            La finalidad de la divulgación de estos datos es permitir que potenciales compradores localicen el
            repuesto deseado y se comuniquen directamente con el Usuario para concretar la transacción
            comercial.
          </p>

          <h2 className="politica-divulgacion-h2">4. Responsabilidad del usuario</h2>
          <p className="politica-divulgacion-p">
            El Usuario garantiza que la información suministrada es veraz y que cuenta con las facultades
            legales para comercializar los productos ofrecidos. El Usuario entiende que La Plataforma actúa
            únicamente como un conector logístico y tecnológico, y no es responsable de la calidad, garantía o
            entrega de los productos vendidos.
          </p>

          <h2 className="politica-divulgacion-h2">5. Derechos del titular (ARCO)</h2>
          <p className="politica-divulgacion-p">
            El Usuario podrá en cualquier momento solicitar la actualización, corrección o supresión de sus
            datos de contacto de la vista pública, enviando una solicitud a través de los canales oficiales de
            soporte de GEOMOTOR o dando de baja su suscripción mensual.
          </p>

          <h2 className="politica-divulgacion-h2">6. Aceptación</h2>
          <p className="politica-divulgacion-p">
            Al marcar el checkbox de &quot;Acepto los Términos y Condiciones y la Divulgación de Datos de
            Contacto&quot;, el Usuario declara haber leído y aceptado en su totalidad el presente documento.
          </p>

          <p className="politica-divulgacion-p politica-divulgacion-cierre">
            <strong>GEOMOTOR</strong> — Conectando el mercado automotriz de Venezuela.
          </p>

          <aside className="politica-divulgacion-nota">
            <strong>Nota:</strong> conserva una copia de este documento para tu archivo. Si publicas el mismo
            texto en Google Docs u otro enlace, puedes definir la variable de entorno{' '}
            <code>VITE_POLITICA_DIVULGACION_DOC_URL</code> para mostrar un acceso directo aquí abajo.
            {DOC_URL ? (
              <>
                {' '}
                <a href={DOC_URL} target="_blank" rel="noopener noreferrer" className="politica-divulgacion-doc-externo">
                  Abrir documento en enlace externo
                </a>
              </>
            ) : null}
          </aside>
        </div>
      </article>
    </div>
  );
}
