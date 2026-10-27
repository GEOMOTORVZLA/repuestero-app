import { listaContactosWhatsapp, type TelefonosNegocio } from '../utils/telefonosNegocio';

type Props = {
  prefijo: string;
  telefonos: TelefonosNegocio;
  mensaje: string;
  onContacto?: () => void;
};

/** Un botón por número, uno debajo del otro y centrados. */
export function BotonesWhatsappContacto({ prefijo, telefonos, mensaje, onContacto }: Props) {
  const lista = listaContactosWhatsapp(prefijo, telefonos, mensaje);
  if (lista.length === 0) {
    return <p className="busqueda-repuestos-modal-sin-contacto">Sin teléfono registrado.</p>;
  }
  return (
    <div className="busqueda-repuestos-modal-whatsapp-lista">
      {lista.map((item) => (
        <a
          key={`${item.etiqueta}-${item.numeroVisible}`}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="busqueda-repuestos-modal-whatsapp"
          onClick={() => onContacto?.()}
        >
          <span>{item.etiqueta}</span>
          <span className="busqueda-repuestos-modal-whatsapp-numero">{item.numeroVisible}</span>
        </a>
      ))}
    </div>
  );
}
