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
      /** Flexible aceptada y aun descargando o instalando. */
      descargaEnCurso: boolean;
    };

export type EventoDescargaFlexible =
  | { tipo: 'progreso' }
  | { tipo: 'descargada' }
  | { tipo: 'fallo' }
  | { tipo: 'cancelado' };

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

function installStatusDe(info: { installStatus?: number }): number | undefined {
  return info.installStatus;
}

function esDescargaEnCurso(info: {
  updateAvailability: AppUpdateAvailability;
  installStatus?: number;
}): boolean {
  const st = installStatusDe(info);
  if (info.updateAvailability === AppUpdateAvailability.UPDATE_IN_PROGRESS) return true;
  return (
    st === FlexibleUpdateInstallStatus.PENDING ||
    st === FlexibleUpdateInstallStatus.DOWNLOADING ||
    st === FlexibleUpdateInstallStatus.INSTALLING
  );
}

/** Solo Android nativo. Si falla la comprobacion, no molesta al usuario. */
export async function comprobarActualizacionPlay(): Promise<ResultadoComprobacionActualizacion> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return { disponible: false };
  }

  try {
    const info = await AppUpdate.getAppUpdateInfo();
    const installStatus = installStatusDe(info);
    const flexibleYaDescargada = installStatus === FlexibleUpdateInstallStatus.DOWNLOADED;
    const descargaEnCurso = !flexibleYaDescargada && esDescargaEnCurso(info);

    if (
      info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE &&
      !flexibleYaDescargada &&
      !descargaEnCurso
    ) {
      return { disponible: false };
    }

    const availableVersionCode = String(info.availableVersionCode ?? '');
    if (!availableVersionCode && !flexibleYaDescargada && !descargaEnCurso) {
      return { disponible: false };
    }

    const omitida = leerOmitida();
    if (
      !flexibleYaDescargada &&
      !descargaEnCurso &&
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
      descargaEnCurso,
    };
  } catch {
    return { disponible: false };
  }
}

export async function iniciarActualizacionPlay(opciones: {
  flexibleUpdateAllowed: boolean;
  immediateUpdateAllowed: boolean;
}): Promise<'ok' | 'cancelado' | 'fallo' | 'ya_descargada'> {
  try {
    const actual = await AppUpdate.getAppUpdateInfo();
    const st = installStatusDe(actual);
    if (st === FlexibleUpdateInstallStatus.DOWNLOADED) return 'ya_descargada';
    if (esDescargaEnCurso(actual)) return 'ok';

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

export async function suscribirDescargaFlexible(
  onEvento: (evento: EventoDescargaFlexible) => void
): Promise<() => void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return () => undefined;
  }
  const handle = await AppUpdate.addListener('onFlexibleUpdateStateChange', (state) => {
    if (
      state.installStatus === FlexibleUpdateInstallStatus.PENDING ||
      state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADING ||
      state.installStatus === FlexibleUpdateInstallStatus.INSTALLING
    ) {
      onEvento({ tipo: 'progreso' });
      return;
    }
    if (state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
      onEvento({ tipo: 'descargada' });
      return;
    }
    if (state.installStatus === FlexibleUpdateInstallStatus.FAILED) {
      onEvento({ tipo: 'fallo' });
      return;
    }
    if (state.installStatus === FlexibleUpdateInstallStatus.CANCELED) {
      onEvento({ tipo: 'cancelado' });
    }
  });
  return () => {
    void handle.remove();
  };
}
