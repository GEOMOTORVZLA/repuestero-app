import { Link } from 'react-router-dom';
import { POLITICA_DIVULGACION_VERSION } from '../constants/politicaDivulgacionDatos';
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
        <p className="politica-divulgacion-meta">
          Geomotor - Politica de divulgacion de datos - Version {POLITICA_DIVULGACION_VERSION}
        </p>
      </header>

      <article className="politica-divulgacion-doc">
        <div className="politica-divulgacion-hoja">
          <h1 className="politica-divulgacion-titulo">
            Politica de divulgacion y tratamiento de datos comerciales
          </h1>
          <p className="politica-divulgacion-subtitulo">
            Documento informativo para vendedores y talleres que se registran en Geomotor.
            Al marcar la casilla de aceptacion en el registro, confirmas que has leido y comprendido lo siguiente.
          </p>

          <h2 className="politica-divulgacion-h2">1. Finalidad</h2>
          <p className="politica-divulgacion-p">
            Geomotor conecta compradores con vendedores de repuestos y con talleres. Para ello es necesario
            mostrar a los usuarios informacion comercial y de contacto asociada a tu negocio.
          </p>

          <h2 className="politica-divulgacion-h2">2. Datos que pueden mostrarse publicamente</h2>
          <p className="politica-divulgacion-p">Segun lo que ingreses, podran verse, entre otros:</p>
          <ul className="politica-divulgacion-lista">
            <li>Nombre comercial y datos identificativos (por ejemplo, razon social o RIF).</li>
            <li>Telefono y, si lo indicas, correo u otros medios de contacto autorizados.</li>
            <li>Estado, ciudad o municipio y, si aplica, direccion u orientacion de ubicacion.</li>
            <li>Coordenadas o mapa cuando actives la ubicacion para busquedas por zona.</li>
            <li>Informacion de catalogo que publiques como vendedor.</li>
            <li>Especialidad, marca atendida y descripcion del taller.</li>
            <li>Formas de pago que indiques como aceptadas.</li>
          </ul>

          <h2 className="politica-divulgacion-h2">3. Alcance de la divulgacion</h2>
          <p className="politica-divulgacion-p">
            La informacion podra ser consultada por visitantes y usuarios registrados en busquedas, listados,
            fichas de contacto y mapas. El servicio tiene como fin facilitar el contacto comercial entre partes.
          </p>

          <h2 className="politica-divulgacion-h2">4. Tu responsabilidad</h2>
          <p className="politica-divulgacion-p">
            Te comprometes a proporcionar datos veraces y actualizados, y a no incluir informacion de terceros
            sin autorizacion. Geomotor puede moderar o restringir perfiles que incumplan normas de uso o
            requisitos de aprobacion.
          </p>

          <h2 className="politica-divulgacion-h2">5. Conservacion y revisiones</h2>
          <p className="politica-divulgacion-p">
            Los datos se conservaran mientras mantengas una cuenta activa o segun lo requiera la operacion del
            servicio y la normativa aplicable. Esta politica puede actualizarse; si hay cambios sustanciales,
            se podra solicitar una nueva aceptacion o notificacion por los medios disponibles.
          </p>

          <h2 className="politica-divulgacion-h2">6. Aceptacion</h2>
          <p className="politica-divulgacion-p">
            Al registrarte como vendedor o taller y marcar la casilla correspondiente, declaras haber leido
            esta politica y aceptas la divulgacion de los datos comerciales descritos en el marco de Geomotor.
          </p>

          <aside className="politica-divulgacion-nota">
            <strong>Nota:</strong> conviene que un asesor legal adapte este texto. Puedes sustituir estos
            parrafos por el documento definitivo (por ejemplo el generado en Gemini).
            {DOC_URL ? (
              <>
                {' '}
                <a href={DOC_URL} target="_blank" rel="noopener noreferrer" className="politica-divulgacion-doc-externo">
                  Abrir borrador en documento externo
                </a>
              </>
            ) : null}
          </aside>
        </div>
      </article>
    </div>
  );
}