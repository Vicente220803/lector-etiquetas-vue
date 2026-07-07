/**
 * NODO: Code JavaScript - ANALISIS ETIQUETA ALTA CLIENTE NUEVO
 * Versión: 1.0
 * ultima_actualizacion: 2026-07-06
 *
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 *
 * PROPÓSITO: Analiza la etiqueta de un producto nuevo y clasifica si
 * puede activarse "tal cual" (caso ESTANDAR) o si requiere modificar
 * los workflows piña/coco (caso EXCEPCION).
 *
 * Recibe (en $('Webhook').item.json.body):
 *  - producto_json (string): JSON con los campos del producto que el
 *    compa acaba de rellenar en Maestros (id, cliente, nombre_sap, ean,
 *    tipo_codigo_ean, gramaje_peso_fijo, p_x_*, etiqueta_de_caja, dun,
 *    cliente_alias).
 *
 * Recibe (en $('Analyze image').item.json): JSON estricto devuelto por
 * OpenAI Vision según el prompt (ean_completo, tipo_ean, peso_neto, ...).
 *
 * Recibe (en $('Get many rows').all()): productos activos de BD para
 * detectar colisiones de prefijo EAN.
 *
 * Devuelve JSON estructurado según especificación en
 * docs/workflows/analisis-etiqueta-alta.md.
 */

// ============================================================
// 1. PARSING: obtenemos las 3 fuentes de datos
// ============================================================

let iaFalloTotalmente = false;
let mensajeErrorIA = "";
let openaiOutput;

// Producto rellenado por el compa (viene como JSON string en el body)
const bodyDatos = $('Webhook').item.json.body || {};
let productoRellenado = {};
try {
  productoRellenado = typeof bodyDatos.producto_json === 'string'
    ? JSON.parse(bodyDatos.producto_json)
    : (bodyDatos.producto_json || {});
} catch (e) {
  return [{
    json: {
      error: true,
      mensaje_error: "El campo 'producto_json' no es un JSON válido.",
      detalle: String(e)
    }
  }];
}

// Output de OpenAI (foto analizada)
try {
  const inputIA = $('Analyze image').item;
  if (!inputIA || inputIA.json.error) {
    iaFalloTotalmente = true;
    mensajeErrorIA = inputIA?.json?.error?.message || "La IA no devolvió datos.";
  } else {
    openaiOutput = inputIA.json;
    if (Array.isArray(openaiOutput)) openaiOutput = openaiOutput[0];
  }
} catch (e) {
  iaFalloTotalmente = true;
  mensajeErrorIA = "Error crítico entre nodos: " + String(e);
}

if (iaFalloTotalmente) {
  return [{
    json: {
      error: true,
      mensaje_error: mensajeErrorIA,
      clasificacion: "REINTENTAR"
    }
  }];
}

// Extraer el texto/JSON del output OpenAI (mismo patrón que otros workflows)
let fullText = openaiOutput?.content?.[0]?.text
            || openaiOutput?.output?.[0]?.content?.[0]?.text
            || openaiOutput?.response?.output?.[0]?.content?.[0]?.text
            || openaiOutput?.message?.content
            || openaiOutput?.choices?.[0]?.message?.content
            || openaiOutput?.output_text
            || openaiOutput?.text
            || openaiOutput?.content?.parts?.[0]?.text
            || (typeof openaiOutput === 'string' ? openaiOutput : '')
            || "";

// El prompt pide JSON estricto, pero por si viene con ```json ... ``` alrededor
fullText = fullText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

let detectado;
try {
  detectado = JSON.parse(fullText);
} catch (e) {
  return [{
    json: {
      error: true,
      mensaje_error: "La IA no devolvió JSON válido.",
      raw_ia: fullText,
      detalle: String(e)
    }
  }];
}

// Productos activos en BD
const productosDB = $('Get many rows').all().map(it => it.json);
const activos = productosDB.filter(p => {
  const v = p.en_activo;
  return v === true || String(v).toUpperCase() === "TRUE" || v === 1 || v === "1";
});

// ============================================================
// 2. CHEQUEO 1: Colisiones de prefijo EAN
// ============================================================
// Si el prefijo detectado en la foto coincide con el prefijo de OTRO
// producto activo (distinto del que estamos analizando), hay colisión.

const prefijoDetectado = detectado.ean_prefijo_7dig || null;
const idActual = productoRellenado.id || null;

let otrosConMismoPrefijo = [];
if (prefijoDetectado && prefijoDetectado.length === 7) {
  otrosConMismoPrefijo = activos.filter(p => {
    if (p.id === idActual) return false; // ignoramos el propio producto
    const eanBd = String(p.ean || "").trim();
    if (eanBd.length < 7) return false;
    return eanBd.substring(0, 7) === prefijoDetectado;
  }).map(p => ({
    id: p.id,
    cliente: p.cliente,
    nombre_sap: p.nombre_sap,
    ean: p.ean
  }));
}

// Colisión "grave": otro producto con mismo prefijo Y distinto cliente
// (los del mismo cliente son SKUs paralelos, se gestionan con desambiguación
// por marca/logo — no bloqueante).
const clienteRellenado = String(productoRellenado.cliente || "").toUpperCase().trim();
const colisionesGraves = otrosConMismoPrefijo.filter(p => {
  const c = String(p.cliente || "").toUpperCase().trim();
  return c && c !== clienteRellenado &&
         !c.includes(clienteRellenado) && !clienteRellenado.includes(c);
});

const prefijoColisiona = colisionesGraves.length > 0;

// ============================================================
// 3. CHEQUEO 2: Comparación campo por campo
// ============================================================

function estadoComparacion(rellenado, detectado, esperadoNullSiVariable = false) {
  const relEs = rellenado === null || rellenado === undefined || rellenado === "";
  const detEs = detectado === null || detectado === undefined || detectado === "";
  if (relEs && detEs) return "OK";
  if (relEs && !detEs) return "REVISAR (rellena)";
  if (!relEs && detEs) return "OK (rellenado)";
  const relStr = String(rellenado).toUpperCase().trim();
  const detStr = String(detectado).toUpperCase().trim();
  if (relStr === detStr) return "OK";
  if (relStr.includes(detStr) || detStr.includes(relStr)) return "OK (similar)";
  return "DIFIERE";
}

const comparaciones = [];

// Cliente: por prefijo EAN podemos deducir el cliente si es un prefijo conocido
const clienteDeducido = otrosConMismoPrefijo.length > 0
  ? otrosConMismoPrefijo[0].cliente
  : null;
comparaciones.push({
  campo: "cliente",
  valor_rellenado: productoRellenado.cliente,
  valor_detectado: clienteDeducido || "(no deducible por prefijo)",
  estado: clienteDeducido
    ? estadoComparacion(productoRellenado.cliente, clienteDeducido)
    : "OK (no verificable)"
});

// EAN: comparamos prefijo rellenado (primeros 7) vs prefijo detectado
const eanRellenado = String(productoRellenado.ean || "").trim();
const prefijoRellenado = eanRellenado.length >= 7 ? eanRellenado.substring(0, 7) : null;
comparaciones.push({
  campo: "ean_prefijo",
  valor_rellenado: prefijoRellenado || "(no rellenado)",
  valor_detectado: prefijoDetectado || "(no detectado)",
  estado: estadoComparacion(prefijoRellenado, prefijoDetectado)
});

// Tipo EAN — compara equivalencias conceptuales entre BD (texto libre) y IA (enum).
// Ej: "No contiene" (BD) ≡ "sin_ean" (IA), "Peso variable" ≡ "variable_peso_9_3_1", etc.
comparaciones.push({
  campo: "tipo_codigo_ean",
  valor_rellenado: productoRellenado.tipo_codigo_ean,
  valor_detectado: detectado.tipo_ean,
  estado: (() => {
    const rel = String(productoRellenado.tipo_codigo_ean || "").toLowerCase();
    const det = String(detectado.tipo_ean || "").toLowerCase();
    if (!rel && !det) return "OK";
    // Equivalencia "sin EAN"
    const relSinEan = rel.includes("no contiene") || rel.includes("sin ean") || rel.includes("sin_ean");
    const detSinEan = det === "sin_ean";
    if (relSinEan && detSinEan) return "OK";
    // Equivalencia variable precio
    if ((rel.includes("variable precio") || rel.includes("variable_precio")) && det === "variable_precio_9_3_1") return "OK";
    // Equivalencia variable peso (ALDI)
    if ((rel.includes("variable peso") || rel.includes("variable_peso")) && det === "variable_peso_9_3_1") return "OK";
    // Generales (por si en BD queda solo "Variable" o "Fijo" sin especificar)
    if (rel.includes("variable") && det.includes("variable")) return "OK";
    if (rel.includes("fijo") && det.includes("fijo")) return "OK";
    if (rel === det) return "OK";
    return "DIFIERE";
  })()
});

// Gramaje: solo debería estar rellenado si es peso fijo
const gramajeDetectado = (() => {
  // Si es variable precio, gramaje suele ser null (cada bote pesa distinto)
  if (String(detectado.tipo_ean || "").startsWith("variable")) return null;
  // Si es fijo, deducir del peso_neto detectado
  if (detectado.peso_neto) {
    const m = String(detectado.peso_neto).match(/(\d+(?:[,.]\d+)?)\s*Kg/i);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
  }
  return null;
})();
comparaciones.push({
  campo: "gramaje_peso_fijo",
  valor_rellenado: productoRellenado.gramaje_peso_fijo,
  valor_detectado: gramajeDetectado,
  estado: (() => {
    const esVariable = String(detectado.tipo_ean || "").startsWith("variable");
    const esSinEan = detectado.tipo_ean === "sin_ean";
    const relTieneValor = productoRellenado.gramaje_peso_fijo !== null && productoRellenado.gramaje_peso_fijo !== undefined;
    if (esVariable && !relTieneValor) return "OK (variable precio)";
    if (esVariable && relTieneValor) return "REVISAR (variable no lleva gramaje)";
    if (esSinEan && relTieneValor && !gramajeDetectado) return "OK (etiqueta no muestra peso, valor tomado de BD)";
    if (relTieneValor && gramajeDetectado && Number(productoRellenado.gramaje_peso_fijo) !== Number(gramajeDetectado)) return "DIFIERE";
    return "OK";
  })()
});

// Código R
comparaciones.push({
  campo: "codigo_r_visible",
  valor_rellenado: null,
  valor_detectado: detectado.codigo_r_visible,
  estado: detectado.codigo_r_visible
    ? (clienteRellenado.includes("MERCADONA") ? "OK (obligatorio en MERCADONA)" : "REVISAR (¿obligatorio para este cliente?)")
    : (clienteRellenado.includes("MERCADONA") ? "REVISAR (MERCADONA suele llevar código R)" : "OK (código R no aplica)")
});

// Fecha envasado visible
comparaciones.push({
  campo: "fecha_envasado_visible",
  valor_rellenado: null,
  valor_detectado: detectado.fecha_envasado_visible,
  estado: detectado.fecha_envasado_visible ? "OK (visible, workflow lo usa como referencia)" : "OK (workflow usa fecha_produccion de la orden)"
});

// ============================================================
// 4. CLASIFICACIÓN ESTANDAR vs EXCEPCION
// ============================================================

const motivosExcepcion = [];

// Idioma no soportado
const idiomasSoportados = ["ESPAÑOL", "CATALÁN", "CATALAN"];
const idiomaDet = String(detectado.idioma || "").toUpperCase().trim();
if (idiomaDet && !idiomasSoportados.includes(idiomaDet)) {
  motivosExcepcion.push(`Idioma "${detectado.idioma}" no soportado por regex actuales (español, catalán). Requiere añadir regex de fechas/lote en el workflow.`);
}

// Sin EAN
if (detectado.tipo_ean === "sin_ean") {
  motivosExcepcion.push("Etiqueta sin EAN legible. Requiere heurística de identificación por otras señales (peso fijo, origen, lote), similar a ALABAU/ANTICH/GUFRESCO.");
}

// Colisión de prefijo con cliente distinto
if (prefijoColisiona) {
  const nombres = colisionesGraves.map(c => c.cliente).join(", ");
  motivosExcepcion.push(`Prefijo EAN colisiona con otro cliente activo (${nombres}). Requiere revisar identificación en el workflow para desambiguar.`);
}

// Formato lote irregular
if (detectado.lote_formato === "otros") {
  motivosExcepcion.push(`Formato de lote no estándar (ejemplo: ${detectado.lote_ejemplo}). Requiere ajustar regex de lote en el workflow.`);
}

// Código R obligatorio en cliente que no es MERCADONA
if (detectado.codigo_r_visible && !clienteRellenado.includes("MERCADONA")) {
  motivosExcepcion.push(`Código R visible en cliente ${productoRellenado.cliente}. Solo MERCADONA tiene bloqueo por código R. Si es obligatorio para este cliente, hay que añadir la regla en el workflow.`);
}

// Tipo EAN raro
if (!["variable_precio_9_3_1", "variable_peso_9_3_1", "fijo_13", "fijo_8", "sin_ean"].includes(detectado.tipo_ean)) {
  motivosExcepcion.push(`Tipo de EAN no reconocido: "${detectado.tipo_ean}".`);
}

// ============================================================
// 4b. HEURÍSTICAS YA SOPORTADAS EN LOS WORKFLOWS ACTUALES
// ============================================================
// Cuando el patrón detectado ES una excepción pero YA está cubierta por
// código existente en los workflows piña/coco, movemos ese motivo a
// "cubiertos_por_heuristica" y NO cuenta para la clasificación final.
// Solo salta a EXCEPCION real si aparece un motivo NO cubierto.

const heuristicasCubiertas = [];

// GUFRESCO / OPCIO GELATS SL — workflow coco
// Patrón: sin EAN + origen India o Costa de Marfil + lote 3 dígitos
if (
  detectado.tipo_ean === "sin_ean" &&
  /INDIA|COSTA\s+DE?\s+MARFIL/i.test(String(detectado.origen || "")) &&
  detectado.lote_formato === "3 dígitos" &&
  (/GUFRESCO|GELATS|OPCIO/i.test(clienteRellenado))
) {
  heuristicasCubiertas.push({
    workflow: "coco",
    heuristica: "GUFRESCO/GELATS sin EAN por origen India-Marfil + lote 3 dig",
    motivo_cubierto: "sin_ean"
  });
}

// ALABAU FRUTAS Y VERDURAS — workflow piña
// Patrón: sin EAN + piña rodajas + peso 0.540 kg
if (
  detectado.tipo_ean === "sin_ean" &&
  /RODAJAS/i.test(String(detectado.producto_texto || "")) &&
  detectado.peso_neto && /0[.,]540\s*Kg/i.test(String(detectado.peso_neto)) &&
  /ALABAU/i.test(clienteRellenado)
) {
  heuristicasCubiertas.push({
    workflow: "pina",
    heuristica: "ALABAU sin EAN por piña rodajas + peso 0.540kg",
    motivo_cubierto: "sin_ean"
  });
}

// ANTICH SPANISH FOOD — workflow piña
// Patrón: sin EAN + origen Costa Rica + lote 3 dígitos
if (
  detectado.tipo_ean === "sin_ean" &&
  /COSTA\s*RICA/i.test(String(detectado.origen || "")) &&
  detectado.lote_formato === "3 dígitos" &&
  /ANTICH/i.test(clienteRellenado)
) {
  heuristicasCubiertas.push({
    workflow: "pina",
    heuristica: "ANTICH sin EAN por origen Costa Rica + lote 3 dig",
    motivo_cubierto: "sin_ean"
  });
}

// CASA AMETLLER — workflow piña
// Patrón: idioma catalán (regex "caducitat" ya soportado)
if (
  /CATALÁN|CATALAN/i.test(String(detectado.idioma || "")) &&
  /AMETLLER/i.test(clienteRellenado)
) {
  heuristicasCubiertas.push({
    workflow: "pina",
    heuristica: "CASA AMETLLER en catalán (regex 'caducitat' incluida)",
    motivo_cubierto: "idioma_catalan"
  });
}

// LIDL Chef Select vs PRP — workflow piña
// Patrón: LIDL + marca "chef select" en OCR → desambigua via nombre_sap
if (
  detectado.marca_logo &&
  /CHEF\s*SELECT/i.test(String(detectado.marca_logo)) &&
  /LIDL/i.test(clienteRellenado)
) {
  heuristicasCubiertas.push({
    workflow: "pina",
    heuristica: "LIDL Chef Select desambiguado por marca en OCR + nombre_sap del padre",
    motivo_cubierto: "colision_prefijo_LIDL"
  });
}

// Motivos que quedan sin cubrir por heurística existente
const motivosNoCubiertos = motivosExcepcion.filter(m => {
  const esSinEan = /sin EAN legible/i.test(m);
  const esIdioma = /Idioma "/i.test(m);
  const esColisionPrefijo = /Prefijo EAN colisiona/i.test(m);

  if (esSinEan && heuristicasCubiertas.some(h => h.motivo_cubierto === "sin_ean")) return false;
  if (esIdioma && heuristicasCubiertas.some(h => h.motivo_cubierto === "idioma_catalan")) return false;
  if (esColisionPrefijo && heuristicasCubiertas.some(h => h.motivo_cubierto === "colision_prefijo_LIDL")) return false;

  return true;
});

const clasificacion = motivosNoCubiertos.length === 0 ? "ESTANDAR" : "EXCEPCION";

// ============================================================
// 5. DETERMINAR WORKFLOW DESTINO
// ============================================================

const nombreSapRellenado = String(productoRellenado.nombre_sap || "").toUpperCase();
let workflowDestino = "pina";
if (/COCO/.test(nombreSapRellenado)) workflowDestino = "coco";

// TACOS DELMONTE tienen flujo especial 3-fases (tarrina + film + caja) que
// requiere el workflow tacos-frontal para el film. OJO: hay otros productos
// llamados "tacos" (GUFRESCO coco tacos, LIDL Chef Select tacos, etc.) que
// NO usan el flujo 3-fases — son bolsas o botes normales. Solo DELMONTE
// TACOS activa el 3-fases.
const esTacos3Fases = /TACOS/.test(nombreSapRellenado) && /DELMONTE/i.test(clienteRellenado);

// ============================================================
// 6. NOTAS Y RECOMENDACIÓN
// ============================================================

const notas = [];

if (detectado.marca_logo) {
  notas.push(`Marca/logo detectada: "${detectado.marca_logo}". Si hay otro SKU del mismo cliente con marca distinta, puede requerir desambiguación como Chef Select/PRP.`);
}

if (otrosConMismoPrefijo.length > 0 && !prefijoColisiona) {
  // Comparte prefijo pero mismo cliente → SKUs paralelos
  notas.push(`Otros productos del mismo cliente comparten el prefijo EAN (${otrosConMismoPrefijo.map(o => o.nombre_sap).join(", ")}). La desambiguación entre SKUs se hará por 'nombre_sap' via el parámetro producto que envía el padre.`);
}

if (!detectado.fecha_envasado_visible) {
  notas.push("La etiqueta NO muestra fecha de envasado. El workflow usará la fecha_produccion que envía la HojaFabricacion como referencia.");
}

if (esTacos3Fases) {
  notas.push("Producto DELMONTE TACOS. Requiere flujo 3-fases (tarrina + film + caja). Además del workflow piña, revisar workflow tacos-frontal para la fase film.");
}

if (detectado.fecha_caducidad && !detectado.fecha_caducidad.match(/\d{2,4}$/)) {
  notas.push("Fecha caducidad sin año. El workflow asume año actual/siguiente automáticamente.");
}

// Si hay heurísticas ya cubiertas, añadir notas informativas
heuristicasCubiertas.forEach(h => {
  notas.push(`Este patrón YA está cubierto por la heurística "${h.heuristica}" en el workflow ${h.workflow}. No hace falta cambiar código.`);
});

const recomendacion = clasificacion === "ESTANDAR"
  ? (heuristicasCubiertas.length > 0
      ? `Puedes activar el producto en BD. Aunque la etiqueta tiene un patrón especial, ya está cubierto por heurística existente en el workflow ${workflowDestino}.`
      : `Puedes activar el producto en BD. El workflow ${workflowDestino} lo identificará por prefijo EAN sin cambios adicionales.`)
  : `NO activar el producto todavía. Abrir Claude Code con este informe (copia el JSON completo). Se necesita añadir lógica al workflow ${workflowDestino} para: ${motivosNoCubiertos.map(m => m.split('.')[0]).join('; ')}.`;

// ============================================================
// 7. DEVOLVER JSON ESTRUCTURADO
// ============================================================

return [{
  json: {
    detectado_en_etiqueta: detectado,
    comparacion_con_campos_rellenados: comparaciones,
    chequeo_colisiones_ean: {
      prefijo_detectado: prefijoDetectado,
      prefijo_colisiona: prefijoColisiona,
      otros_productos_mismo_prefijo: otrosConMismoPrefijo,
      colisiones_graves: colisionesGraves
    },
    clasificacion: clasificacion,
    requiere_cambios_workflow: clasificacion === "EXCEPCION",
    workflow_destino: workflowDestino,
    es_tacos: esTacos3Fases,
    motivos_excepcion: motivosNoCubiertos,
    heuristicas_ya_cubiertas: heuristicasCubiertas,
    notas: notas,
    recomendacion_activacion: recomendacion,
    producto_analizado: {
      id: productoRellenado.id,
      cliente: productoRellenado.cliente,
      nombre_sap: productoRellenado.nombre_sap
    },
    fecha_informe: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  }
}];
