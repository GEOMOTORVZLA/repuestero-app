import { useCallback, useEffect, useState } from 'react';
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

/**
 * Solo Android: avisa si Play Store tiene una version nueva.
 * Fallos silenciosos; el usuario puede omitir hasta la siguiente version.
 * Si la flexible ya descargo, nunca deja al usuario atrapado sin salida.
 */
export function AvisoActualizacionApp() {
  const [info, setInfo] = useState<InfoDisponible | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [listaParaReiniciar, setListaParaReiniciar] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [errorReinicio, setErrorReinicio] = useState('');

  const revisar = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    const r = await comprobarActualizacionPlay();
    if (r.disponible) {
      if (r.flexibleYaDescargada) {
        setListaParaReiniciar(true);
        setInfo(null);
        return;
      }
      setInfo(r);
    }
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

      void suscribirDescargaFlexible(() => {
        setListaParaReiniciar(true);
        setInfo(null);
        setErrorReinicio('');
      }).then((off) => {
        removeFlex = off;
      });
    }

    return () => {
      removeApp?.();
      removeFlex?.();
    };
  }, [revisar]);

  if (!info && !listaParaReiniciar) return null;

  if (listaParaReiniciar) {
    return (
      <div
        className="aviso-actualizacion"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-act-listo-titulo"
      >
        <div className="aviso-actualizacion-card">
          <h2 id="aviso-act-listo-titulo" className="aviso-actualizacion-titulo">
            Actualización lista
          </h2>
          <p className="aviso-actualizacion-texto">
            La nueva versión de Geomotor ya se descargó. Reinicia la app para instalarla.
          </p>
          {errorReinicio ? (
            <p className="aviso-actualizacion-error" role="alert">
              {errorReinicio}
            </p>
          ) : null}
          <div className="aviso-actualizacion-acciones">
            <button
              type="button"
              className="aviso-actualizacion-btn aviso-actualizacion-btn--secundario"
              disabled={reiniciando}
              onClick={() => {
                setListaParaReiniciar(false);
                setErrorReinicio('');
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
        </div>
      </div>
    );
  }

  if (!info) return null;

  const versionLabel = info.availableVersionName ? ` (${info.availableVersionName})` : '';

  return (
    <div className="aviso-actualizacion" role="dialog" aria-modal="true" aria-labelledby="aviso-act-titulo">
      <div className="aviso-actualizacion-card">
        <h2 id="aviso-act-titulo" className="aviso-actualizacion-titulo">
          Hay una actualización
        </h2>
        <p className="aviso-actualizacion-texto">
          Hay una versión nueva de Geomotor en Play Store{versionLabel}. ¿Quieres actualizar ahora?
        </p>
        <div className="aviso-actualizacion-acciones">
          <button
            type="button"
            className="aviso-actualizacion-btn aviso-actualizacion-btn--secundario"
            disabled={actualizando}
            onClick={() => {
              omitirActualizacionHasta(info.availableVersionCode);
              setInfo(null);
            }}
          >
            Ahora no
          </button>
          <button
            type="button"
            className="aviso-actualizacion-btn aviso-actualizacion-btn--primario"
            disabled={actualizando}
            onClick={() => {
              void (async () => {
                setActualizando(true);
                const r = await iniciarActualizacionPlay(info);
                setActualizando(false);
                if (r === 'ok' || r === 'cancelado') setInfo(null);
              })();
            }}
          >
            {actualizando ? 'Abriendo...' : 'Actualizar'}
          </button>
        </div>
      </div>
    </div>
  );
}
