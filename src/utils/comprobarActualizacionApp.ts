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
    if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
      return { disponible: false };
    }

    const availableVersionCode = String(info.availableVersionCode ?? '');
    if (!availableVersionCode) return { disponible: false };

    const omitida = leerOmitida();
    if (omitida && omitida === availableVersionCode) {
      return { disponible: false };
    }

    return {
      disponible: true,
      availableVersionCode,
      availableVersionName: info.availableVersionName,
      flexibleUpdateAllowed: Boolean(info.flexibleUpdateAllowed),
      immediateUpdateAllowed: Boolean(info.immediateUpdateAllowed),
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

export async function completarActualizacionFlexible(): Promise<void> {
  await AppUpdate.completeFlexibleUpdate();
}

export async function suscribirDescargaFlexible(onDescargada: () => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => undefined;
  }
  const handle = await AppUpdate.addListener('onFlexibleUpdateStateChange', (state) => {
    if (state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
      onDescargada();
    }
  });
  return () => {
    void handle.remove();
  };
}
