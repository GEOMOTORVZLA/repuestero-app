import { categoriasEquivalentesConsulta } from './categoriasProducto';
import type { PiezaGuiaAuto, SugerenciaPiezaGuia } from './piezasGuiaAuto';

export type PiezaGuiaMoto = PiezaGuiaAuto;

export const PIEZAS_GUIA_MOTO: PiezaGuiaMoto[] = [
  {
    "id": "kit_arrastre",
    "etiqueta": "Kit de arrastre (cadena, corona y piñón)",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "kit de arrastre",
      "cadena",
      "corona",
      "piñón",
      "pinon",
      "kit de transmisión",
      "kit transmision"
    ],
    "top15": true
  },
  {
    "id": "bandas_freno_traseras",
    "etiqueta": "Bandas de freno traseras (zapatas)",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "bandas de freno",
      "zapatas",
      "zapatas traseras",
      "bandas traseras"
    ],
    "top15": true
  },
  {
    "id": "pastillas_freno_delanteras",
    "etiqueta": "Pastillas de freno delanteras",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "pastillas",
      "pastillas delanteras",
      "pastilla de freno"
    ],
    "top15": true
  },
  {
    "id": "bujia_moto",
    "etiqueta": "Bujía de encendido",
    "categoriaGeomotor": "Motor",
    "alias": [
      "bujía",
      "bujia",
      "spark",
      "bujía de moto"
    ],
    "top15": true
  },
  {
    "id": "tripas_camaras",
    "etiqueta": "Tripas / cámaras de caucho",
    "categoriaGeomotor": "Cauchos y tripas",
    "alias": [
      "tripa",
      "cámara",
      "camara",
      "cámara de aire",
      "inner tube"
    ],
    "top15": true
  },
  {
    "id": "guaya_croche",
    "etiqueta": "Guaya de croche (embrague)",
    "categoriaGeomotor": "Manubrios y puños",
    "alias": [
      "guaya de croche",
      "guaya de embrague",
      "cable de clutch",
      "guaya clutch"
    ],
    "top15": true
  },
  {
    "id": "guaya_acelerador",
    "etiqueta": "Guaya de acelerador",
    "categoriaGeomotor": "Manubrios y puños",
    "alias": [
      "guaya de acelerador",
      "cable de acelerador",
      "guaya gas"
    ],
    "top15": true
  },
  {
    "id": "discos_embrague_moto",
    "etiqueta": "Discos de embrague (croche)",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "discos de embrague",
      "discos de croche",
      "clutch discs",
      "disco clutch"
    ],
    "top15": true
  },
  {
    "id": "cauchos_moto",
    "etiqueta": "Cauchos / neumáticos",
    "categoriaGeomotor": "Cauchos y tripas",
    "alias": [
      "caucho",
      "neumático",
      "neumatico",
      "llanta",
      "caucho trasero",
      "caucho delantero"
    ],
    "top15": true
  },
  {
    "id": "rodamientos_rueda_moto",
    "etiqueta": "Rodamientos de rueda (6202, 6302)",
    "categoriaGeomotor": "Accesorios",
    "alias": [
      "rodamiento",
      "rolinera",
      "rosca 6202",
      "rosca 6302",
      "bearing"
    ],
    "top15": true
  },
  {
    "id": "bateria_moto",
    "etiqueta": "Batería de moto (12V gel/ácido)",
    "categoriaGeomotor": "Componentes eléctricos",
    "alias": [
      "batería",
      "bateria",
      "bateria 12v",
      "bateria gel"
    ],
    "top15": true
  },
  {
    "id": "filtro_aire_moto",
    "etiqueta": "Filtro de aire (espuma/papel)",
    "categoriaGeomotor": "Motor",
    "alias": [
      "filtro de aire",
      "filtro de espuma",
      "filtro papel moto"
    ],
    "top15": true
  },
  {
    "id": "amortiguadores_traseros_moto",
    "etiqueta": "Amortiguadores traseros",
    "categoriaGeomotor": "Amortiguadores",
    "alias": [
      "amortiguador trasero",
      "amortiguadores",
      "suspensión trasera"
    ],
    "top15": true
  },
  {
    "id": "bombillos_faro_moto",
    "etiqueta": "Bombillos / focos de faro (LED / halógeno)",
    "categoriaGeomotor": "Iluminación",
    "alias": [
      "bombillo",
      "foco",
      "faro",
      "led moto",
      "halógeno"
    ],
    "top15": true
  },
  {
    "id": "carburador_moto",
    "etiqueta": "Carburador / kit de reparación",
    "categoriaGeomotor": "Motor",
    "alias": [
      "carburador",
      "kit carburador",
      "gicles",
      "jets",
      "aguja flotante"
    ],
    "top15": true
  },
  {
    "id": "gomas_impacto_corona",
    "etiqueta": "Gomas de impacto (manzana / porta corona)",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "gomas de impacto",
      "cauchos de manzana",
      "porta corona",
      "rubber damper"
    ],
    "top15": false
  },
  {
    "id": "eslabon_candado_cadena",
    "etiqueta": "Eslabón candado de cadena",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "eslabón candado",
      "candado de cadena",
      "master link"
    ],
    "top15": false
  },
  {
    "id": "grasa_cadenas",
    "etiqueta": "Grasa para cadenas",
    "categoriaGeomotor": "Accesorios",
    "alias": [
      "grasa de cadena",
      "lubricante de cadena"
    ],
    "top15": false
  },
  {
    "id": "eje_trasero_moto",
    "etiqueta": "Eje trasero",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "eje trasero",
      "eje de rueda",
      "eje rin"
    ],
    "top15": false
  },
  {
    "id": "disco_freno_delantero_moto",
    "etiqueta": "Disco de freno delantero",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "disco de freno",
      "disco delantero",
      "rotor"
    ],
    "top15": false
  },
  {
    "id": "liquido_frenos_moto",
    "etiqueta": "Líquido de frenos DOT3/DOT4",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "líquido de frenos",
      "dot3",
      "dot4",
      "brake fluid"
    ],
    "top15": false
  },
  {
    "id": "manilla_freno_moto",
    "etiqueta": "Manilla de freno",
    "categoriaGeomotor": "Manubrios y puños",
    "alias": [
      "manilla de freno",
      "palanca de freno"
    ],
    "top15": false
  },
  {
    "id": "kit_gomas_caliper_moto",
    "etiqueta": "Kit de gomas de mordaza / caliper",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "gomas de caliper",
      "kit caliper",
      "mordaza",
      "caliper"
    ],
    "top15": false
  },
  {
    "id": "resorte_pedal_freno",
    "etiqueta": "Resorte de pedal de freno",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "resorte de pedal",
      "resorte freno"
    ],
    "top15": false
  },
  {
    "id": "varilla_freno_moto",
    "etiqueta": "Varilla de freno",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "varilla de freno",
      "varilla freno trasero"
    ],
    "top15": false
  },
  {
    "id": "leva_freno_trasera",
    "etiqueta": "Leva de freno trasera",
    "categoriaGeomotor": "Frenos",
    "alias": [
      "leva de freno",
      "leva trasera"
    ],
    "top15": false
  },
  {
    "id": "separadores_embrague",
    "etiqueta": "Separadores de metal (embrague)",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "separadores",
      "steels clutch",
      "separadores de croche"
    ],
    "top15": false
  },
  {
    "id": "resortes_prensa_embrague",
    "etiqueta": "Resortes de prensa",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "resortes de prensa",
      "resortes clutch"
    ],
    "top15": false
  },
  {
    "id": "empacadura_tapa_croche",
    "etiqueta": "Empacadura de tapa de croche",
    "categoriaGeomotor": "Transmisión",
    "alias": [
      "empacadura de croche",
      "junta tapa embrague"
    ],
    "top15": false
  },
  {
    "id": "aceite_20w50_moto",
    "etiqueta": "Aceite 20W50 de moto",
    "categoriaGeomotor": "Accesorios",
    "alias": [
      "aceite 20w50",
      "aceite de moto",
      "20w50"
    ],
    "top15": false
  },
  {
    "id": "manilla_croche",
    "etiqueta": "Manilla de croche",
    "categoriaGeomotor": "Manubrios y puños",
    "alias": [
      "manilla de croche",
      "manilla de embrague",
      "palanca clutch"
    ],
    "top15": false
  },
  {
    "id": "base_manilla",
    "etiqueta": "Base / soporte de manilla",
    "categoriaGeomotor": "Manubrios y puños",
    "alias": [
      "base de manilla",
      "soporte de manilla",
      "perch clutch"
    ],
    "top15": false
  },
  {
    "id": "tensor_guaya",
    "etiqueta": "Tensor de guaya",
    "categoriaGeomotor": "Manubrios y puños",
    "alias": [
      "tensor de guaya",
      "tensor cable"
    ],
    "top15": false
  },
  {
    "id": "protector_rin_corbata",
    "etiqueta": "Protector de rin (corbata)",
    "categoriaGeomotor": "Cauchos y tripas",
    "alias": [
      "corbata",
      "protector de rin",
      "rim strip"
    ],
    "top15": false
  },
  {
    "id": "parchos_pega",
    "etiqueta": "Parchos y pega",
    "categoriaGeomotor": "Cauchos y tripas",
    "alias": [
      "parchos",
      "pega de tripa",
      "parche"
    ],
    "top15": false
  },
  {
    "id": "valvula_camara",
    "etiqueta": "Válvula",
    "categoriaGeomotor": "Cauchos y tripas",
    "alias": [
      "válvula",
      "valvula",
      "niple"
    ],
    "top15": false
  },
  {
    "id": "amortiguadores_delanteros_barras",
    "etiqueta": "Amortiguadores delanteros (barras / telescópicas)",
    "categoriaGeomotor": "Bastones",
    "alias": [
      "barras",
      "telescópicas",
      "horquilla",
      "amortiguador delantero"
    ],
    "top15": false
  },
  {
    "id": "retenes_barra",
    "etiqueta": "Retenes de barra",
    "categoriaGeomotor": "Bastones",
    "alias": [
      "retenes de barra",
      "retenes horquilla"
    ],
    "top15": false
  },
  {
    "id": "guardapolvos_barra",
    "etiqueta": "Guardapolvos de barra",
    "categoriaGeomotor": "Bastones",
    "alias": [
      "guardapolvo",
      "guardapolvos de barra"
    ],
    "top15": false
  },
  {
    "id": "aceite_barras_fork",
    "etiqueta": "Aceite hidráulico para barras (fork oil)",
    "categoriaGeomotor": "Bastones",
    "alias": [
      "fork oil",
      "aceite de barras",
      "aceite horquilla"
    ],
    "top15": false
  },
  {
    "id": "capuchon_bujia",
    "etiqueta": "Capuchón de bujía (cachimba)",
    "categoriaGeomotor": "Motor",
    "alias": [
      "capuchón",
      "cachimba",
      "pipa de bujía"
    ],
    "top15": false
  },
  {
    "id": "bobina_alta_moto",
    "etiqueta": "Bobina de alta",
    "categoriaGeomotor": "Componentes eléctricos",
    "alias": [
      "bobina",
      "bobina de alta",
      "coil"
    ],
    "top15": false
  },
  {
    "id": "cdi_moto",
    "etiqueta": "CDI",
    "categoriaGeomotor": "Componentes eléctricos",
    "alias": [
      "cdi",
      "caja cdi",
      "ignition cdi"
    ],
    "top15": false
  },
  {
    "id": "regulador_rectificador",
    "etiqueta": "Regulador / rectificador de corriente",
    "categoriaGeomotor": "Componentes eléctricos",
    "alias": [
      "regulador",
      "rectificador",
      "regulador de voltaje"
    ],
    "top15": false
  },
  {
    "id": "solenoide_arranque",
    "etiqueta": "Solenoide de arranque (chanchito)",
    "categoriaGeomotor": "Componentes eléctricos",
    "alias": [
      "solenoide",
      "chanchito",
      "relé de arranque",
      "rele arranque"
    ],
    "top15": false
  },
  {
    "id": "fusibles_moto",
    "etiqueta": "Fusibles",
    "categoriaGeomotor": "Componentes eléctricos",
    "alias": [
      "fusible",
      "fusibles"
    ],
    "top15": false
  },
  {
    "id": "filtro_gasolina_moto",
    "etiqueta": "Filtro de gasolina para moto",
    "categoriaGeomotor": "Motor",
    "alias": [
      "filtro de gasolina",
      "filtro de nafta"
    ],
    "top15": false
  },
  {
    "id": "tobera_admision",
    "etiqueta": "Tobera / múltiple de admisión",
    "categoriaGeomotor": "Motor",
    "alias": [
      "tobera",
      "múltiple de admisión",
      "intake boot"
    ],
    "top15": false
  }
];

export const RELACIONES_PIEZAS_MOTO: Record<string, SugerenciaPiezaGuia[]> = {
  "kit_arrastre": [
    {
      "piezaId": "gomas_impacto_corona",
      "prioridad": 1
    },
    {
      "piezaId": "eslabon_candado_cadena",
      "prioridad": 1
    },
    {
      "piezaId": "grasa_cadenas",
      "prioridad": 2
    },
    {
      "piezaId": "eje_trasero_moto",
      "prioridad": 3
    }
  ],
  "pastillas_freno_delanteras": [
    {
      "piezaId": "disco_freno_delantero_moto",
      "prioridad": 1
    },
    {
      "piezaId": "liquido_frenos_moto",
      "prioridad": 1
    },
    {
      "piezaId": "manilla_freno_moto",
      "prioridad": 2
    },
    {
      "piezaId": "kit_gomas_caliper_moto",
      "prioridad": 3
    }
  ],
  "bandas_freno_traseras": [
    {
      "piezaId": "resorte_pedal_freno",
      "prioridad": 1
    },
    {
      "piezaId": "varilla_freno_moto",
      "prioridad": 1
    },
    {
      "piezaId": "leva_freno_trasera",
      "prioridad": 2
    },
    {
      "piezaId": "rodamientos_rueda_moto",
      "prioridad": 2
    }
  ],
  "discos_embrague_moto": [
    {
      "piezaId": "separadores_embrague",
      "prioridad": 1
    },
    {
      "piezaId": "resortes_prensa_embrague",
      "prioridad": 1
    },
    {
      "piezaId": "empacadura_tapa_croche",
      "prioridad": 2
    },
    {
      "piezaId": "aceite_20w50_moto",
      "prioridad": 2
    }
  ],
  "guaya_croche": [
    {
      "piezaId": "manilla_croche",
      "prioridad": 1
    },
    {
      "piezaId": "base_manilla",
      "prioridad": 2
    },
    {
      "piezaId": "tensor_guaya",
      "prioridad": 2
    },
    {
      "piezaId": "guaya_acelerador",
      "prioridad": 3
    }
  ],
  "tripas_camaras": [
    {
      "piezaId": "cauchos_moto",
      "prioridad": 1
    },
    {
      "piezaId": "protector_rin_corbata",
      "prioridad": 1
    },
    {
      "piezaId": "parchos_pega",
      "prioridad": 2
    },
    {
      "piezaId": "valvula_camara",
      "prioridad": 2
    }
  ],
  "amortiguadores_delanteros_barras": [
    {
      "piezaId": "retenes_barra",
      "prioridad": 1
    },
    {
      "piezaId": "guardapolvos_barra",
      "prioridad": 1
    },
    {
      "piezaId": "aceite_barras_fork",
      "prioridad": 2
    }
  ],
  "bujia_moto": [
    {
      "piezaId": "capuchon_bujia",
      "prioridad": 1
    },
    {
      "piezaId": "bobina_alta_moto",
      "prioridad": 1
    },
    {
      "piezaId": "cdi_moto",
      "prioridad": 2
    }
  ],
  "bateria_moto": [
    {
      "piezaId": "regulador_rectificador",
      "prioridad": 1
    },
    {
      "piezaId": "solenoide_arranque",
      "prioridad": 1
    },
    {
      "piezaId": "fusibles_moto",
      "prioridad": 2
    }
  ],
  "carburador_moto": [
    {
      "piezaId": "filtro_gasolina_moto",
      "prioridad": 1
    },
    {
      "piezaId": "tobera_admision",
      "prioridad": 1
    },
    {
      "piezaId": "filtro_aire_moto",
      "prioridad": 2
    }
  ]
};

export const PIEZAS_TOP15_MOTO = PIEZAS_GUIA_MOTO.filter((p) => p.top15);

const POR_ID = new Map(PIEZAS_GUIA_MOTO.map((p) => [p.id, p]));

export function piezaGuiaMotoPorId(id: string): PiezaGuiaMoto | undefined {
  return POR_ID.get(id);
}

export function categoriasConsultaPiezaMoto(pieza: PiezaGuiaMoto): string[] {
  return categoriasEquivalentesConsulta(pieza.categoriaGeomotor);
}

export function sugerenciasDePiezaMoto(piezaId: string): SugerenciaPiezaGuia[] {
  return [...(RELACIONES_PIEZAS_MOTO[piezaId] ?? [])].sort((a, b) => a.prioridad - b.prioridad);
}
