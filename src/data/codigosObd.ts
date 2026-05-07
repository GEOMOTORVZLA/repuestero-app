export interface CodigoObd {
  codigo: string;
  descripcion: string;
  componente: string;
  causas: string[];
  soluciones: string[];
  terminosBusqueda: string[];
  gravedad: 'baja' | 'media' | 'alta';
}

const CODIGOS_OBD_DETALLADOS: CodigoObd[] = [
  {
    codigo: 'P0100',
    descripcion: 'Circuito del sensor de flujo de aire MAF',
    componente: 'sensor MAF',
    causas: ['Sensor MAF sucio o danado', 'Fuga de aire en admision', 'Conector o cableado defectuoso'],
    soluciones: ['Limpiar o reemplazar el sensor MAF', 'Revisar ductos de admision', 'Verificar conectores y cableado'],
    terminosBusqueda: ['sensor MAF', 'sensor flujo de aire', 'ducto admision'],
    gravedad: 'media',
  },
  {
    codigo: 'P0113',
    descripcion: 'Senal alta del sensor de temperatura de aire de admision IAT',
    componente: 'sensor IAT',
    causas: ['Sensor IAT abierto', 'Cableado desconectado', 'Conector sulfatado'],
    soluciones: ['Revisar conector del IAT', 'Medir resistencia del sensor', 'Reemplazar sensor IAT'],
    terminosBusqueda: ['sensor IAT', 'sensor temperatura aire admision'],
    gravedad: 'media',
  },
  {
    codigo: 'P0128',
    descripcion: 'Temperatura del refrigerante por debajo del rango esperado',
    componente: 'termostato',
    causas: ['Termostato abierto', 'Sensor ECT defectuoso', 'Bajo nivel de refrigerante'],
    soluciones: ['Cambiar termostato', 'Revisar sensor ECT', 'Verificar fugas de refrigerante'],
    terminosBusqueda: ['termostato', 'sensor temperatura', 'refrigerante'],
    gravedad: 'media',
  },
  {
    codigo: 'P0130',
    descripcion: 'Circuito del sensor de oxigeno banco 1 sensor 1',
    componente: 'sensor de oxigeno',
    causas: ['Sensor de oxigeno danado', 'Fuga de escape', 'Cableado defectuoso'],
    soluciones: ['Reemplazar sensor de oxigeno', 'Revisar escape', 'Verificar conectores'],
    terminosBusqueda: ['sensor oxigeno', 'sonda lambda'],
    gravedad: 'media',
  },
  {
    codigo: 'P0171',
    descripcion: 'Sistema demasiado pobre banco 1',
    componente: 'sensor MAF',
    causas: ['Fuga de vacio', 'Bomba de gasolina debil', 'Inyectores sucios', 'Sensor MAF sucio'],
    soluciones: ['Buscar fugas de vacio', 'Medir presion de gasolina', 'Limpiar inyectores y MAF'],
    terminosBusqueda: ['sensor MAF', 'bomba gasolina', 'inyector', 'manguera vacio'],
    gravedad: 'media',
  },
  {
    codigo: 'P0172',
    descripcion: 'Sistema demasiado rico banco 1',
    componente: 'inyectores',
    causas: ['Inyectores goteando', 'Regulador de presion defectuoso', 'Sensor MAF con lectura incorrecta'],
    soluciones: ['Revisar inyectores', 'Medir presion de combustible', 'Verificar MAF y sensor de oxigeno'],
    terminosBusqueda: ['inyector', 'regulador gasolina', 'sensor MAF'],
    gravedad: 'media',
  },
  {
    codigo: 'P0300',
    descripcion: 'Fallo de encendido aleatorio o multiple',
    componente: 'bobina de encendido',
    causas: ['Bujias gastadas', 'Bobinas defectuosas', 'Inyectores sucios', 'Baja compresion'],
    soluciones: ['Revisar bujias y bobinas', 'Escanear cilindros con falla', 'Limpiar inyectores'],
    terminosBusqueda: ['bobina encendido', 'bujia', 'inyector'],
    gravedad: 'alta',
  },
  {
    codigo: 'P0335',
    descripcion: 'Circuito del sensor de posicion del ciguenal',
    componente: 'sensor de ciguenal',
    causas: ['Sensor CKP defectuoso', 'Cableado abierto', 'Rueda fonica danada'],
    soluciones: ['Revisar senal CKP', 'Inspeccionar conector', 'Reemplazar sensor de ciguenal'],
    terminosBusqueda: ['sensor ciguenal', 'sensor CKP'],
    gravedad: 'alta',
  },
  {
    codigo: 'P0340',
    descripcion: 'Circuito del sensor de posicion del arbol de levas',
    componente: 'sensor de arbol de levas',
    causas: ['Sensor CMP defectuoso', 'Cableado danado', 'Problemas de sincronizacion'],
    soluciones: ['Revisar senal CMP', 'Inspeccionar correa o cadena de tiempo', 'Reemplazar sensor'],
    terminosBusqueda: ['sensor arbol de levas', 'sensor CMP'],
    gravedad: 'alta',
  },
  {
    codigo: 'P0401',
    descripcion: 'Flujo insuficiente del sistema EGR',
    componente: 'valvula EGR',
    causas: ['Valvula EGR obstruida', 'Conductos carbonizados', 'Solenoide EGR defectuoso'],
    soluciones: ['Limpiar EGR y conductos', 'Probar solenoide', 'Reemplazar valvula EGR'],
    terminosBusqueda: ['valvula EGR', 'solenoide EGR'],
    gravedad: 'media',
  },
  {
    codigo: 'P0420',
    descripcion: 'Eficiencia del catalizador por debajo del umbral banco 1',
    componente: 'catalizador',
    causas: ['Catalizador agotado', 'Sensor de oxigeno defectuoso', 'Fuga de escape'],
    soluciones: ['Revisar sensores de oxigeno', 'Verificar fugas', 'Reemplazar catalizador si aplica'],
    terminosBusqueda: ['catalizador', 'sensor oxigeno', 'sonda lambda'],
    gravedad: 'media',
  },
  {
    codigo: 'P0442',
    descripcion: 'Fuga pequena en sistema EVAP',
    componente: 'tapa de gasolina',
    causas: ['Tapa de gasolina floja', 'Manguera EVAP agrietada', 'Valvula de purga defectuosa'],
    soluciones: ['Ajustar o cambiar tapa', 'Revisar mangueras EVAP', 'Probar valvula de purga'],
    terminosBusqueda: ['tapa gasolina', 'valvula purga', 'canister'],
    gravedad: 'baja',
  },
  {
    codigo: 'P0455',
    descripcion: 'Fuga grande en sistema EVAP',
    componente: 'valvula de purga',
    causas: ['Tapa de gasolina ausente', 'Manguera EVAP rota', 'Canister danado'],
    soluciones: ['Cambiar tapa de gasolina', 'Inspeccionar lineas EVAP', 'Revisar canister y valvulas'],
    terminosBusqueda: ['valvula purga', 'canister', 'tapa gasolina'],
    gravedad: 'baja',
  },
  {
    codigo: 'P0500',
    descripcion: 'Sensor de velocidad del vehiculo',
    componente: 'sensor de velocidad',
    causas: ['Sensor VSS defectuoso', 'Cableado danado', 'Problema en tablero o transmision'],
    soluciones: ['Reemplazar sensor VSS', 'Revisar conectores', 'Verificar senal de velocidad'],
    terminosBusqueda: ['sensor velocidad', 'sensor VSS'],
    gravedad: 'media',
  },
  {
    codigo: 'P0700',
    descripcion: 'Falla general del sistema de control de transmision',
    componente: 'modulo de transmision',
    causas: ['Codigo interno en TCM', 'Sensor de transmision defectuoso', 'Solenoide de cambio con falla'],
    soluciones: ['Escanear modulo TCM', 'Revisar solenoides', 'Verificar nivel y estado de aceite de caja'],
    terminosBusqueda: ['solenoide caja', 'sensor transmision', 'modulo transmision'],
    gravedad: 'alta',
  },
  {
    codigo: 'P0740',
    descripcion: 'Circuito del embrague del convertidor de par',
    componente: 'solenoide TCC',
    causas: ['Solenoide TCC defectuoso', 'Aceite de transmision contaminado', 'Convertidor con desgaste'],
    soluciones: ['Revisar solenoide TCC', 'Cambiar aceite si corresponde', 'Diagnosticar convertidor'],
    terminosBusqueda: ['solenoide TCC', 'solenoide caja', 'convertidor'],
    gravedad: 'alta',
  },
];

function generarCodigo(codigo: string): CodigoObd {
  const n = Number(codigo.slice(1));
  if (n >= 300 && n <= 399) {
    return {
      codigo,
      descripcion: 'Falla relacionada con encendido o combustion',
      componente: 'bobina de encendido',
      causas: ['Bujia, bobina o inyector con falla', 'Entrada de aire falsa', 'Problema de compresion'],
      soluciones: ['Revisar bujias y bobinas', 'Medir compresion si la falla persiste', 'Verificar inyectores'],
      terminosBusqueda: ['bobina encendido', 'bujia', 'inyector'],
      gravedad: 'alta',
    };
  }
  if (n >= 700 && n <= 899) {
    return {
      codigo,
      descripcion: 'Falla relacionada con transmision automatica',
      componente: 'solenoide de transmision',
      causas: ['Solenoide defectuoso', 'Aceite de caja bajo o contaminado', 'Sensor de transmision con falla'],
      soluciones: ['Escanear modulo de transmision', 'Revisar aceite de caja', 'Probar solenoides'],
      terminosBusqueda: ['solenoide caja', 'sensor transmision', 'aceite transmision'],
      gravedad: 'alta',
    };
  }
  if (n >= 400 && n <= 499) {
    return {
      codigo,
      descripcion: 'Falla relacionada con emisiones, EGR o EVAP',
      componente: 'valvula EGR',
      causas: ['Sistema EVAP con fuga', 'EGR obstruida', 'Sensor de emisiones defectuoso'],
      soluciones: ['Revisar mangueras y valvulas', 'Limpiar EGR', 'Verificar sensores de oxigeno'],
      terminosBusqueda: ['valvula EGR', 'valvula purga', 'canister', 'sensor oxigeno'],
      gravedad: 'media',
    };
  }
  if (n >= 100 && n <= 199) {
    return {
      codigo,
      descripcion: 'Falla relacionada con medicion de aire, combustible o sensores de motor',
      componente: 'sensor MAF',
      causas: ['Sensor MAF/MAP sucio', 'Fuga de vacio', 'Sensor de oxigeno con lectura incorrecta'],
      soluciones: ['Limpiar sensor MAF/MAP', 'Revisar admision', 'Verificar presion de combustible'],
      terminosBusqueda: ['sensor MAF', 'sensor MAP', 'sensor oxigeno', 'bomba gasolina'],
      gravedad: 'media',
    };
  }
  if (n >= 200 && n <= 299) {
    return {
      codigo,
      descripcion: 'Falla relacionada con inyectores o circuito de combustible',
      componente: 'inyector',
      causas: ['Inyector obstruido', 'Cableado de inyector defectuoso', 'Baja presion de combustible'],
      soluciones: ['Probar inyectores', 'Medir presion de gasolina', 'Revisar cableado'],
      terminosBusqueda: ['inyector', 'bomba gasolina', 'regulador gasolina'],
      gravedad: 'media',
    };
  }
  return {
    codigo,
    descripcion: 'Falla generica del tren motriz detectada por OBDII',
    componente: 'sensor de motor',
    causas: ['Sensor o actuador fuera de rango', 'Cableado defectuoso', 'Falla intermitente registrada por ECU'],
    soluciones: ['Confirmar codigo con scanner', 'Revisar conectores', 'Consultar datos en vivo antes de reemplazar piezas'],
    terminosBusqueda: ['sensor motor', 'scanner', 'conector'],
    gravedad: 'media',
  };
}

export const CODIGOS_OBD_COMUNES: CodigoObd[] = (() => {
  const mapa = new Map(CODIGOS_OBD_DETALLADOS.map((item) => [item.codigo, item]));
  for (let i = 1; mapa.size < 500 && i <= 999; i += 1) {
    const codigo = `P${String(i).padStart(4, '0')}`;
    if (!mapa.has(codigo)) mapa.set(codigo, generarCodigo(codigo));
  }
  return Array.from(mapa.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
})();

export function buscarCodigoObd(codigo: string): CodigoObd | null {
  return CODIGOS_OBD_COMUNES.find((item) => item.codigo === codigo) ?? null;
}
