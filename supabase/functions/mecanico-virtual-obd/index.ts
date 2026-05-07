import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const modeloDiagnostico = () => Deno.env.get("OPENAI_DIAGNOSTICO_MODEL") ?? "gpt-4o";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const body = await req.json();
    const tipoConsulta = String(body?.tipoConsulta ?? "auto").trim().toLowerCase();
    const codigo = String(body?.codigo ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const marcaVehiculo = String(body?.marcaVehiculo ?? "").trim();
    const modeloVehiculo = String(body?.modeloVehiculo ?? "").trim();
    const cilindraje = String(body?.cilindraje ?? "").trim();
    const anio = String(body?.anio ?? "").trim();
    const sintomas = String(body?.sintomas ?? "").trim();

    if (tipoConsulta === "auto_sintomas") {
      if (!marcaVehiculo || !modeloVehiculo || !sintomas) {
        return new Response(JSON.stringify({ error: "Datos insuficientes para diagnostico por sintomas" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!apiKey) {
        return new Response(JSON.stringify({
          descripcion: "Para diagnosticar fallas por sintomas hay que activar la IA avanzada.",
          diagnosticoPrincipal: "Diagnostico por sintomas no disponible sin IA avanzada.",
          explicacionTecnica: "La consulta por sintomas requiere interpretar el contexto del vehiculo y la falla reportada.",
          componente: "sistema de motor",
          causas: ["IA avanzada no configurada"],
          soluciones: ["Configura OPENAI_API_KEY en Supabase"],
          queRevisarPrimero: ["Configurar OPENAI_API_KEY en Supabase"],
          pruebasRecomendadas: ["Reintentar la consulta cuando la IA avanzada este activa"],
          advertenciaSeguridad: "Te sugerimos contrastar esta opinion con un profesional de la mecanica, esto es solo una herramienta orientativa.",
          terminosBusqueda: ["sensor motor", "bujia", "bobina"],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const promptAutoSintomas = `
Eres un mecanico automotriz profesional senior, especialista en diagnostico electrico, electronico y mecanico para una plataforma de repuestos en Venezuela.
Tu respuesta debe parecer la orientacion de un mecanico experto en taller, no una lista generica ni una respuesta corta.
El usuario NO conoce necesariamente el codigo OBDII y describe sintomas, comportamiento del vehiculo o una reparacion reciente.
Responde SOLO JSON valido, sin markdown.
Marca del vehiculo: ${marcaVehiculo}
Modelo del vehiculo: ${modeloVehiculo}
Sintomas reportados: ${sintomas}

Devuelve este formato exacto:
{
  "diagnosticoPrincipal": "hipotesis principal en una frase profesional",
  "descripcion": "respuesta inicial clara en español latino, explicando por que esa falla puede estar ocurriendo",
  "explicacionTecnica": "explicacion tecnica desarrollada de 2 a 4 parrafos cortos, conectando sintomas, reparacion reciente, sistemas electronicos/mecanicos y comportamiento del vehiculo",
  "componente": "principal sistema o repuesto involucrado",
  "causas": ["4 a 6 causas probables, cada una con una explicacion concreta y no generica"],
  "soluciones": ["3 a 5 acciones correctivas o verificaciones concretas"],
  "queRevisarPrimero": ["3 a 5 revisiones ordenadas desde lo mas probable y economico hasta lo mas complejo"],
  "pruebasRecomendadas": ["3 a 5 pruebas practicas, preferiblemente con scanner/datos en vivo cuando aplique"],
  "advertenciaSeguridad": "usa exactamente este texto: Te sugerimos contrastar esta opinion con un profesional de la mecanica, esto es solo una herramienta orientativa.",
  "terminosBusqueda": ["3 a 6 terminos cortos para buscar repuestos"]
}
Reglas obligatorias:
- Si el usuario menciona que la falla comenzo despues de cambiar una pieza, centra el diagnostico en esa intervencion y explica como pudo alterar sensores, cableado, modulos o ajuste mecanico.
- No respondas con frases genericas como "puede ser un sensor" sin explicar el mecanismo de la falla.
- En causas, cada item debe incluir el por que tecnico. Ejemplo: "Sensor ABS del mozo con señal distinta: si el sensor integrado al cubo nuevo no coincide con el original, el modulo interpreta diferencia de velocidad y puede activar el 4x4".
- En pruebasRecomendadas, incluye pruebas accionables: scanner con datos en vivo, comparacion de señales, inspeccion de conectores, medicion con multimetro, prueba de ruta segura o verificacion mecanica segun aplique.
- En queRevisarPrimero, ordena por probabilidad y costo: conectores/cableado, pieza recien cambiada, compatibilidad, datos de scanner, modulo o componente mayor.
- La explicacionTecnica debe tener profundidad similar a una respuesta profesional de taller: conecta causa, sintoma y consecuencia.
Evalua palabras clave del contexto: cambio reciente de piezas, mozo/rodamiento/cubo, sensor ABS, modulo 4x4, transfer, TCCM/GEM, perdida de fuerza, temblor en minimo, olor a gasolina, humo, recalentamiento, no enciende, falla al acelerar, cascabeleo, consumo alto, luces de tablero, vibracion, falla electrica, frenos o transmision.
Si el caso involucra Explorer, 4x4, ABS, transfer o tren delantero, considera señales de velocidad de rueda, sensor ABS integrado al mozo, rueda fonica, cableado/conector, diferencias de diametro de cauchos y datos en vivo del scanner.
Usa marca y modelo para ajustar la respuesta cuando existan fallas comunes por fabricante, pero aclara cuando no se pueda confirmar sin pruebas.
Ordena la respuesta como mecanico: primero interpreta el problema, luego causas probables, luego pruebas concretas, luego advertencia.
No inventes certeza absoluta. Mantente como guia orientativa sin usar advertencias fuertes sobre gastos o reemplazo de piezas.
`;

      const openaiResAutoSintomas = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modeloDiagnostico(),
          messages: [{ role: "user", content: promptAutoSintomas }],
          temperature: 0.18,
          response_format: { type: "json_object" },
        }),
      });

      if (!openaiResAutoSintomas.ok) {
        return new Response(JSON.stringify({ error: "No se pudo consultar IA por sintomas" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const jsonAutoSintomas = await openaiResAutoSintomas.json();
      const contentAutoSintomas = jsonAutoSintomas?.choices?.[0]?.message?.content;
      const parsedAutoSintomas = contentAutoSintomas ? JSON.parse(contentAutoSintomas) : {};
      return new Response(JSON.stringify(parsedAutoSintomas), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tipoConsulta === "moto") {
      if (!marcaVehiculo || !sintomas) {
        return new Response(JSON.stringify({ error: "Datos insuficientes para diagnostico de moto" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!apiKey) {
        return new Response(JSON.stringify({
          descripcion: "Para diagnosticar fallas de motos por sintomas hay que activar la IA avanzada.",
          diagnosticoPrincipal: "Diagnostico de moto no disponible sin IA avanzada.",
          explicacionTecnica: "La consulta rigurosa de motos requiere interpretar sintomas, marca, cilindraje y sistema afectado.",
          componente: "sistema de encendido",
          causas: ["IA avanzada no configurada"],
          soluciones: ["Configura OPENAI_API_KEY en Supabase"],
          queRevisarPrimero: ["Configurar OPENAI_API_KEY en Supabase"],
          pruebasRecomendadas: ["Reintentar la consulta cuando la IA avanzada este activa"],
          advertenciaSeguridad: "Te sugerimos contrastar esta opinion con un profesional de la mecanica, esto es solo una herramienta orientativa.",
          terminosBusqueda: ["bujia", "bobina", "bateria"],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const promptMoto = `
Eres un mecanico profesional senior especializado en motos, diagnostico electrico, carburacion, inyeccion, encendido, transmision CVT/manual y frenos para una plataforma de repuestos en Venezuela.
Tu respuesta debe ser rigurosa, practica y especifica, no generica ni corta.
Responde SOLO JSON valido, sin markdown.
Marca de la moto: ${marcaVehiculo}
Modelo de la moto: ${modeloVehiculo || "No indicado"}
Cilindraje: ${cilindraje || "No indicado"}
Año: ${anio || "No indicado"}
Codigo de falla opcional: ${codigo || "No indicado"}
Sintomas reportados: ${sintomas}

Devuelve este formato exacto:
{
  "diagnosticoPrincipal": "hipotesis principal en una frase profesional",
  "descripcion": "respuesta inicial clara en español latino, explicando por que esa falla puede estar ocurriendo",
  "explicacionTecnica": "explicacion tecnica desarrollada de 2 a 4 parrafos cortos, conectando sintomas, sistema de la moto y posibles piezas involucradas",
  "componente": "principal sistema o repuesto involucrado",
  "causas": ["4 a 6 causas probables, cada una con una explicacion concreta y no generica"],
  "soluciones": ["3 a 5 acciones correctivas o verificaciones concretas"],
  "queRevisarPrimero": ["3 a 5 revisiones ordenadas desde lo mas probable y economico hasta lo mas complejo"],
  "pruebasRecomendadas": ["3 a 5 pruebas practicas con multimetro, scanner, inspeccion visual o prueba mecanica segun aplique"],
  "advertenciaSeguridad": "usa exactamente este texto: Te sugerimos contrastar esta opinion con un profesional de la mecanica, esto es solo una herramienta orientativa.",
  "terminosBusqueda": ["3 a 6 terminos cortos para buscar repuestos de moto"]
}
Reglas obligatorias:
- Conecta siempre el sintoma con el sistema probable: encendido, combustible, aire, compresion, carga electrica, transmision, frenos o suspension.
- No digas solo "bujia" o "carburador": explica por que ese componente causaria exactamente el sintoma reportado.
- En causas, cada item debe incluir el mecanismo tecnico de la falla.
- En pruebasRecomendadas, incluye acciones concretas: revisar chispa, medir bateria en reposo y cargando, probar bobina/stator/regulador, limpiar carburador/inyector, medir compresion, revisar sensor CKP/TPS, inspeccionar correa CVT, ajustar valvulas o verificar frenos segun aplique.
- En queRevisarPrimero, ordena por probabilidad y costo, pensando en el mercado venezolano y repuestos comunes.
- La explicacionTecnica debe sonar como diagnostico de taller y no como una ficha resumida.
Considera fallas comunes de motos en Venezuela: bujia, capuchon, bobina, CDI/ECU, regulador rectificador, bateria, stator, relay de arranque, carburador, inyector, bomba de gasolina, filtro de aire, sensor TPS, sensor CKP, cuerpo de aceleracion, valvulas, compresion, cadena de tiempo, correa CVT, embrague, variador, frenos, transmision, cauchos y cableado.
Si es moto china o marca con muchos modelos variables, enfocate en sistema, cilindraje y sintomas antes que en modelo exacto.
Si es Yamaha, Honda, Suzuki, Kawasaki, KTM, Ducati, Benelli o Zontes, usa marca/modelo para ajustar fallas frecuentes cuando sea razonable.
Ordena la respuesta como mecanico: interpreta el problema, explica por que ocurre, enumera causas probables, indica pruebas concretas y advierte riesgos de seguridad.
No inventes certeza absoluta. Mantente como guia orientativa sin usar advertencias fuertes sobre gastos o reemplazo de piezas.
`;

      const openaiResMoto = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modeloDiagnostico(),
          messages: [{ role: "user", content: promptMoto }],
          temperature: 0.18,
          response_format: { type: "json_object" },
        }),
      });

      if (!openaiResMoto.ok) {
        return new Response(JSON.stringify({ error: "No se pudo consultar IA de motos" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const jsonMoto = await openaiResMoto.json();
      const contentMoto = jsonMoto?.choices?.[0]?.message?.content;
      const parsedMoto = contentMoto ? JSON.parse(contentMoto) : {};
      return new Response(JSON.stringify(parsedMoto), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^[PBCU][0-9A-F]{4}$/.test(codigo)) {
      return new Response(JSON.stringify({ error: "Codigo OBDII invalido" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!apiKey) {
      return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tieneBase = Boolean(body.descripcion || body.componente);
    const prompt = `
Eres un mecánico automotriz virtual para una plataforma de repuestos en Venezuela.
Responde SOLO JSON válido, sin markdown.
Código OBDII: ${codigo}
Marca del vehículo: ${marcaVehiculo || "No indicada"}
Modelo del vehículo: ${modeloVehiculo || "No indicado"}
El código ${tieneBase ? "tiene" : "no tiene"} datos base en la lista local.
Descripción base: ${body.descripcion ?? "No disponible"}
Componente base: ${body.componente ?? "No disponible"}
Causas base: ${(body.causas ?? []).join("; ")}
Soluciones base: ${(body.soluciones ?? []).join("; ")}
Términos base: ${(body.terminosBusqueda ?? []).join("; ")}

Devuelve este formato exacto:
{
  "descripcion": "explicación clara en español latino",
  "componente": "principal componente o repuesto involucrado",
  "causas": ["3 a 5 causas probables"],
  "soluciones": ["3 a 5 soluciones o verificaciones"],
  "terminosBusqueda": ["3 a 6 términos cortos para buscar repuestos"]
}
Si el código no tiene datos base, identifica la familia OBDII por la primera letra:
P = tren motriz/motor/transmision, B = carroceria, C = chasis, U = comunicacion/red.
Usa marca y modelo para ajustar la respuesta cuando haya diferencias conocidas por fabricante.
Si marca/modelo no son suficientes para una conclusion exacta, dilo claramente.
Si el código es específico de fabricante o no hay informacion universal suficiente, dilo con claridad y da una orientación responsable.
No inventes certeza absoluta. No recomiendes reemplazar piezas sin diagnosticar primero.
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await openaiRes.json();
    const content = json?.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : body;

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
