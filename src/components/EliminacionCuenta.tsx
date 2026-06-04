import { Link } from 'react-router-dom';
import './PoliticaDivulgacionDatos.css';

const EMAIL_SOPORTE = 'geomotorvzla@gmail.com';

export function EliminacionCuenta() {
  const mailto = `mailto:${EMAIL_SOPORTE}?subject=${encodeURIComponent(
    'Solicitud de eliminación de cuenta — Geomotor'
  )}&body=${encodeURIComponent(
    'Quiero solicitar la eliminación de mi cuenta y los datos asociados en Geomotor.\n\n' +
      'Correo con el que estoy registrado:\n\n' +
      'Nombre (opcional):\n'
  )}`;

  return (
    <div className="politica-divulgacion">
      <header className="politica-divulgacion-barra">
        <Link to="/" className="politica-divulgacion-volver">
          Volver al inicio
        </Link>
        <p className="politica-divulgacion-meta">GEOMOTOR · Eliminar cuenta</p>
      </header>

      <article className="politica-divulgacion-doc">
        <div className="politica-divulgacion-hoja">
          <h1 className="politica-divulgacion-titulo">Eliminación de cuenta y datos asociados</h1>
          <p className="politica-divulgacion-subtitulo">
            En Geomotor (sitio web y aplicaciones iOS y Android) puedes solicitar que eliminemos tu cuenta y los datos
            personales ligados a ella cuando ya no quieras usar el servicio, salvo cuando la ley nos exija
            conservar algo (por ejemplo, obligaciones tributarias).
          </p>

          <h2 className="politica-divulgacion-h2">1. Cómo solicitarlo</h2>
          <p className="politica-divulgacion-p">
            Envía un correo desde la dirección con la que te registraste a{' '}
            <strong>
              <a href={mailto}>{EMAIL_SOPORTE}</a>
            </strong>{' '}
            con el asunto sugerido: <em>Solicitud de eliminación de cuenta — Geomotor</em>. En el mensaje indica el
            correo de tu cuenta y, si puedes, el tipo de usuario (comprador, vendedor, taller u otro).
          </p>

          <h2 className="politica-divulgacion-h2">2. Lo que borraremos</h2>
          <p className="politica-divulgacion-p">
            Tras verificar tu identidad de forma razonable, tramitamos la eliminación de tu cuenta en nuestros
            sistemas y del perfil público relacionado cuando aplique (por ejemplo, fichas comerciales o inventario que
            mostrabas solo por estar registrado). Algunos datos anonimizados o agregados pueden conservarse solo con
            fines estadísticos, sin poder identificarte.
          </p>

          <h2 className="politica-divulgacion-h2">3. Plazos</h2>
          <p className="politica-divulgacion-p">
            Respondemos y te confirmamos cuando el proceso esté en curso. El cierre efectivo suele producirse en un
            plazo de hasta <strong>30 días naturales</strong> desde tu solicitud, salvo complicaciones técnicas o
            conflicto pendiente entre usuarios que deba aclararse primero y te lo comuniquemos.
          </p>

          <h2 className="politica-divulgacion-h2">4. Dudas y derechos</h2>
          <p className="politica-divulgacion-p">
            Para rectificar datos, reclamar por el tratamiento de tu información o ejercer derechos relacionados en
            la medida aplicable según legislación nacional, también puedes escribir a{' '}
            <strong>
              <a href={`mailto:${EMAIL_SOPORTE}`}>{EMAIL_SOPORTE}</a>
            </strong>
            .
          </p>

          <p className="politica-divulgacion-p politica-divulgacion-cierre">
            <strong>GEOMOTOR</strong> — Conectando el mercado automotriz de Venezuela.
          </p>

          <aside className="politica-divulgacion-nota">
            <strong>Google Play:</strong> esta página es la referencia oficial para usuarios que desean cerrar cuenta y
            datos asociados en Geomotor.
          </aside>
        </div>
      </article>
    </div>
  );
}
