import { Capacitor } from '@capacitor/core';
import {
  AppUpdate,
  AppUpdateAvailability,
  AppUpdateResultCode,
  FlexibleUpdateInstallStatus,
} from '@capawesome/capacitor-app-update';

const STORAGE_OMITIR = 'geomotor_update_omitir_version';

export type ResultadoComprobacionActualizacion =
  | { disponible: false }
  | {
      disponible: true;
      availableVersionCode: string;
      availableVersionName?: string;
      flexibleUpdateAllowed: boolean;
      immediateUpdateAllowed: boolean;
      /** Flexible ya descargada: hay que reiniciar / completar instalacion. */
      flexibleYaDescargada: boolean;
    };

function leerOmitida(): string | null {
  try {
    return localStorage.getItem(STORAGE_OMITIR);
  } catch {
    return null;
  }
}

export function omitirActualizacionHasta(versionCode: string): void {
  try {
    localStorage.setItem(STORAGE_OMITIR, versionCode);
  } catch {
    /* ignore */
  }
}

/** Solo Android nativo. Si falla la comprobacion, no molesta al usuario. */
export async function comprobarActualizacionPlay(): Promise<ResultadoComprobacionActualizacion> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return { disponible: false };
  }

  try {
    const info = await AppUpdate.getAppUpdateInfo();
    const installStatus = (info as { installStatus?: number }).installStatus;
    const flexibleYaDescargada = installStatus === FlexibleUpdateInstallStatus.DOWNLOADED;

    if (
      info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE &&
      !flexibleYaDescargada
    ) {
      return { disponible: false };
    }

    const availableVersionCode = String(info.availableVersionCode ?? '');
    if (!availableVersionCode && !flexibleYaDescargada) return { disponible: false };

    const omitida = leerOmitida();
    if (
      !flexibleYaDescargada &&
      omitida &&
      availableVersionCode &&
      omitida === availableVersionCode
    ) {
      return { disponible: false };
    }

    return {
      disponible: true,
      availableVersionCode: availableVersionCode || 'descargada',
      availableVersionName: info.availableVersionName,
      flexibleUpdateAllowed: Boolean(info.flexibleUpdateAllowed),
      immediateUpdateAllowed: Boolean(info.immediateUpdateAllowed),
      flexibleYaDescargada,
    };
  } catch {
    return { disponible: false };
  }
}

export async function iniciarActualizacionPlay(opciones: {
  flexibleUpdateAllowed: boolean;
  immediateUpdateAllowed: boolean;
}): Promise<'ok' | 'cancelado' | 'fallo'> {
  try {
    if (opciones.flexibleUpdateAllowed) {
      const r = await AppUpdate.startFlexibleUpdate();
      if (r.code === AppUpdateResultCode.OK) return 'ok';
      if (r.code === AppUpdateResultCode.CANCELED) return 'cancelado';
      return 'fallo';
    }
    if (opciones.immediateUpdateAllowed) {
      const r = await AppUpdate.performImmediateUpdate();
      if (r.code === AppUpdateResultCode.OK) return 'ok';
      if (r.code === AppUpdateResultCode.CANCELED) return 'cancelado';
      return 'fallo';
    }
    await AppUpdate.openAppStore();
    return 'ok';
  } catch {
    try {
      await AppUpdate.openAppStore();
      return 'ok';
    } catch {
      return 'fallo';
    }
  }
}

export async function abrirTiendaPlay(): Promise<void> {
  try {
    await AppUpdate.openAppStore();
  } catch {
    /* ignore */
  }
}

/**
 * Completa la flexible update (reinicio). Si el proceso sigue vivo, el caller ofrece Play Store.
 */
export async function completarActualizacionFlexible(): Promise<'ok' | 'fallo' | 'abrir_tienda'> {
  try {
    await AppUpdate.completeFlexibleUpdate();
    // En un reinicio correcto el JS no llega aqui. Si llega, el OEM no reinicio.
    await new Promise((r) => setTimeout(r, 2500));
    return 'abrir_tienda';
  } catch {
    return 'fallo';
  }
}

export async function suscribirDescargaFlexible(onDescargada: () => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => undefined;
  }
  const handle = await AppUpdate.addListener('onFlexibleUpdateStateChange', (state) => {
    if (state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
      onDescargada();
    }
    if (
      state.installStatus === FlexibleUpdateInstallStatus.FAILED ||
      state.installStatus === FlexibleUpdateInstallStatus.CANCELED
    ) {
      /* el UI de reinicio no debe quedar atrapado sin feedback en el siguiente intento */
    }
  });
  return () => {
    void handle.remove();
  };
}
