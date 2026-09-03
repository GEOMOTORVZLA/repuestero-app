import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  completarActualizacionFlexible,
  comprobarActualizacionPlay,
  iniciarActualizacionPlay,
  omitirActualizacionHasta,
  abrirTiendaPlay,
  suscribirDescargaFlexible,
  type ResultadoComprobacionActualizacion,
} from '../utils/comprobarActualizacionApp';
import './AvisoActualizacionApp.css';

type InfoDisponible = Extract<ResultadoComprobacionActualizacion, { disponible: true }>;
type FaseAviso = 'oferta' | 'descargando' | 'listo';

/**
 * Solo Android: un cartel con oferta → descarga → reinicio.
 * No vuelve a mostrar Actualizar si la flexible ya arranco.
 */
export function AvisoActualizacionApp() {
  const [info, setInfo] = useState<InfoDisponible | null>(null);
  const [fase, setFase] = useState<FaseAviso>('oferta');
  const [esperandoPlay, setEsperandoPlay] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [errorReinicio, setErrorReinicio] = useState('');
  const [errorDescarga, setErrorDescarga] = useState('');
  const [ocultoMientrasDescarga, setOcultoMientrasDescarga] = useState(false);

  const esperandoPlayRef = useRef(false);
  const flexibleEnCursoRef = useRef(false);
  const iniciarLockRef = useRef(false);

  const revisar = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    const r = await comprobarActualizacionPlay();
    if (!r.disponible) {
      if (!esperandoPlayRef.current && !flexibleEnCursoRef.current) {
        setInfo(null);
      }
      return;
    }
    setInfo(r);
    if (r.flexibleYaDescargada) {
      flexibleEnCursoRef.current = false;
      setOcultoMientrasDescarga(false);
      setFase('listo');
      return;
    }
    if (r.descargaEnCurso) {
      flexibleEnCursoRef.current = true;
      setFase('descargando');
      return;
    }
    if (esperandoPlayRef.current || flexibleEnCursoRef.current) {
      return;
    }
    setFase('oferta');
  }, []);

  useEffect(() => {
    void revisar();

    let removeApp: (() => void) | undefined;
    let removeFlex: (() => void) | undefined;

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void revisar();
      }).then((h) => {
        removeApp = () => h.remove();
      });

      void suscribirDescargaFlexible((evento) => {
        if (evento.tipo === 'progreso') {
          flexibleEnCursoRef.current = true;
          setErrorDescarga('');
          setFase('descargando');
          return;
        }
        if (evento.tipo === 'descargada') {
          flexibleEnCursoRef.current = false;
          setOcultoMientrasDescarga(false);
          setErrorReinicio('');
          setFase('listo');
          return;
        }
        flexibleEnCursoRef.current = false;
        setErrorDescarga(
          evento.tipo === 'fallo'
            ? 'No se pudo descargar. Puedes intentarlo de nuevo.'
            : ''
        );
        setFase('oferta');
      }).then((off) => {
        removeFlex = off;
      });
    }

    return () => {
      removeApp?.();
      removeFlex?.();
    };
  }, [revisar]);

  if (!info) return null;
  if (fase === 'descargando' && ocultoMientrasDescarga) return null;

  const versionLabel = info.availableVersionName ? ` (${info.availableVersionName})` : '';

  const titulo =
    fase === 'listo'
      ? 'Actualización lista'
      : fase === 'descargando'
        ? 'Descargando actualización'
        : 'Hay una actualización';

  const texto =
    fase === 'listo'
      ? 'La nueva versión de Geomotor ya se descargó. Reinicia la app para instalarla.'
      : fase === 'descargando'
        ? 'La descarga está en curso. No hace falta pulsar Actualizar otra vez. Puedes seguir usando Geomotor; te avisaremos cuando haya que reiniciar.'
        : `Hay una versión nueva de Geomotor en Play Store${versionLabel}. ¿Quieres actualizar ahora?`;

  return (
    <div className="aviso-actualizacion" role="dialog" aria-modal="true" aria-labelledby="aviso-act-titulo">
      <div className="aviso-actualizacion-card">
        <h2 id="aviso-act-titulo" className="aviso-actualizacion-titulo">
          {titulo}
        </h2>
        <p className="aviso-actualizacion-texto">{texto}</p>
        {errorDescarga && fase === 'oferta' ? (
          <p className="aviso-actualizacion-error" role="alert">
            {errorDescarga}
          </p>
        ) : null}
        {errorReinicio && fase === 'listo' ? (
          <p className="aviso-actualizacion-error" role="alert">
            {errorReinicio}
          </p>
        ) : null}

        {fase === 'oferta' ? (
          <div className="aviso-actualizacion-acciones">
            <button
              type="button"
              className="aviso-actualizacion-btn aviso-actualizacion-btn--secundario"
              disabled={esperandoPlay}
              onClick={() => {
                omitirActualizacionHasta(info.availableVersionCode);
                setInfo(null);
                setErrorDescarga('');
              }}
            >
              Ahora no
            </button>
            <button
              type="button"
              className="aviso-actualizacion-btn aviso-actualizacion-btn--primario"
              disabled={esperandoPlay}
              onClick={() => {
                if (iniciarLockRef.current || esperandoPlayRef.current || flexibleEnCursoRef.current) {
                  return;
                }
                iniciarLockRef.current = true;
                esperandoPlayRef.current = true;
                setEsperandoPlay(true);
                void (async () => {
                  const r = await iniciarActualizacionPlay(info);
                  esperandoPlayRef.current = false;
                  setEsperandoPlay(false);
                  iniciarLockRef.current = false;
                  if (r === 'ya_descargada') {
                    setFase('listo');
                    return;
                  }
                  if (r === 'ok') {
                    if (info.flexibleUpdateAllowed) {
                      flexibleEnCursoRef.current = true;
                      setErrorDescarga('');
                      setFase('descargando');
                      return;
                    }
                    setInfo(null);
                    return;
                  }
                  if (r === 'cancelado') {
                    flexibleEnCursoRef.current = false;
                    setFase('oferta');
                    return;
                  }
                  setErrorDescarga('No se pudo iniciar la actualización. Inténtalo de nuevo.');
                  setFase('oferta');
                })();
              }}
            >
              {esperandoPlay ? 'Abriendo Play…' : errorDescarga ? 'Reintentar' : 'Actualizar'}
            </button>
          </div>
        ) : null}

        {fase === 'descargando' ? (
          <div className="aviso-actualizacion-acciones">
            <button
              type="button"
              className="aviso-actualizacion-btn aviso-actualizacion-btn--primario"
              onClick={() => setOcultoMientrasDescarga(true)}
            >
              Seguir usando la app
            </button>
          </div>
        ) : null}

        {fase === 'listo' ? (
          <>
            <div className="aviso-actualizacion-acciones">
              <button
                type="button"
                className="aviso-actualizacion-btn aviso-actualizacion-btn--secundario"
                disabled={reiniciando}
                onClick={() => {
                  setErrorReinicio('');
                  setInfo(null);
                  setFase('oferta');
                }}
              >
                Más tarde
              </button>
              <button
                type="button"
                className="aviso-actualizacion-btn aviso-actualizacion-btn--primario"
                disabled={reiniciando}
                onClick={() => {
                  void (async () => {
                    setReiniciando(true);
                    setErrorReinicio('');
                    const r = await completarActualizacionFlexible();
                    setReiniciando(false);
                    if (r === 'ok') return;
                    setErrorReinicio(
                      'No se pudo reiniciar aquí. Ábrela en Play Store o inténtalo de nuevo.'
                    );
                    if (r === 'abrir_tienda') {
                      await abrirTiendaPlay();
                    }
                  })();
                }}
              >
                {reiniciando ? 'Reiniciando…' : errorReinicio ? 'Reintentar' : 'Reiniciar ahora'}
              </button>
            </div>
            {errorReinicio ? (
              <button
                type="button"
                className="aviso-actualizacion-btn aviso-actualizacion-btn--enlace"
                disabled={reiniciando}
                onClick={() => {
                  void abrirTiendaPlay();
                }}
              >
                Abrir Play Store
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
