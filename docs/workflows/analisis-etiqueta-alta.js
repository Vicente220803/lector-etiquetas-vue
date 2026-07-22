/**
 * NODO: Code JavaScript - ANALISIS ETIQUETA ALTA CLIENTE NUEVO
 * Versión: 1.7
 * ultima_actualizacion: 2026-07-21
 *
 * NOTA arquitectónica: el análisis de la etiqueta de CAJA (Capa 2) se hace
 * en un webhook SEPARADO dentro del mismo workflow: analisis-etiqueta-alta-CAJA.
 * Ver docs/workflows/analisis-etiqueta-alta-CAJA.js para el Code node de
 * ese webhook.
 *
 * v1.7 — LIDL Chef Select TACOS pasa a heurística cubierta:
 *   - Ya existe el workflow productivo 'verifica-etiqueta-tacos-lidl' en n8n
 *     (ver docs/workflows/tacos-lidl.js).
 *   - Se elimina el motivo "workflow pendiente crear" que disparaba EXCEPCION.
 *   - Se añade heurística cubierta 'tipo_producto_nuevo_lidl_tacos' en
 *     sección 4b para que estos 5 productos salgan como ESTANDAR con nota
 *     informativa.
 *   - workflowDestino = "tacos-lidl" cuando aplique.
 *   - Ampliada normalización defensiva del lote: acepta también "1 XXX"
 *     (1 fijo + 3 dígitos julianos, formato LIDL Chef Select TACOS).
 *   - Sigue vigente la validación estricta del logo amarillo obligatorio.
 *   - Sigue vigente la validación info nutricional del Mix.
 *
 * v1.6 — Validación info nutricional del Mix LIDL Chef Select TACOS:
 *   - Extracción del objeto info_nutricional (todos los productos).
 *   - Validación ESTRICTA para el Mix (nombre_sap contiene "MIX" + prefijo
 *     EAN 4335619): comparación exacta normalizada (sin margen numérico)
 *     contra los valores esperados hardcoded. Si algún campo no coincide o
 *     no aparece → EXCEPCION con lista de errores específicos.
 *   - Protege contra 2 escenarios: valor mal impreso ("44" → "43") y
 *     palabra borrada (campo detectado como null).
 *   - Requiere prompt v1.4 con campo info_nutricional.
 *
 * v1.5 — Chequeo calidad foto (auto-eval IA + defensivo):
 *   - Si detectado.calidad_foto === "mala" → REINTENTAR.
 *   - Chequeo defensivo: si EAN/fecha_caducidad/lote_formato vacíos,
 *     forzar calidad_foto = "mala" aunque la IA diga "buena" (optimismo).
 *   - Si calidad_foto === "regular" → añade nota informativa "verifica manual".
 *   - Requiere prompt v1.3 con nuevo campo calidad_foto.
 *
 * v1.4 — LIDL Chef Select TACOS nuevos (prefijo 4335619):
 *   - Validación estricta del logo amarillo "RECICLA Al Amarillo".
 *     Si logo_reciclaje_amarillo=false → EXCEPCION.
 *   - Aviso de workflow productivo pendiente de crear
 *     (verifica-etiqueta-tacos-lidl) cuando se detecta el prefijo 4335619.
 *   - Silencia el motivo genérico "producto de tipo nuevo" para MELON/SANDIA/MIX
 *     cuando ya se dispara el motivo específico LIDL TACOS.
 *   - Requiere prompt v1.2 con el nuevo campo logo_reciclaje_amarillo.
 *
 * v1.3 — Fix ean_prefijo con lógica propia:
 *   - "OK (rellenado)" reemplazado por "DIFIERE (BD tiene EAN pero foto no)"
 *     cuando BD tiene EAN pero foto no muestra ninguno.
 *   - Añadido motivo EXCEPCION cuando ean_prefijo sale DIFIERE
 *     (foto de producto equivocado).
 *
 * v1.2 — Refinamiento Capa 1 tras primera prueba GUFRESCO COCO TACOS:
 *   - Normalización defensiva: lote_formato="otros" con ejemplo 3 dígitos
 *     se reclasifica a "3 dígitos" (evita falso positivo por variabilidad IA).
 *   - Nueva heurística cubierta: TACOS 1-fase para clientes conocidos
 *     (GUFRESCO, GELATS, OPCIO, LIDL) → NO dispara EXCEPCION.
 *
 * v1.1 — Capa 1 de blindaje: añadidos 3 chequeos a motivosExcepcion:
 *   - Producto de tipo nuevo (nombre_sap sin PIÑA/COCO) → EXCEPCION.
 *   - TACOS que no son DELMONTE → EXCEPCION (confirmar 1-fase vs multi-fase).
 *   - Producto con etiqueta_de_caja=true → EXCEPCION (verificar workflow caja).
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

// Normalización defensiva: si la IA marcó lote_formato como "otros"
// pero el ejemplo es exactamente 3 dígitos (típico GUFRESCO/ANTICH) o
// formato "1 XXX" (LIDL Chef Select TACOS: prefijo 1 fijo + 3 dígitos julianos),
// lo re-clasificamos como "3 dígitos" para que las heurísticas matcheen.
if (
  detectado.lote_formato === "otros" &&
  (/^\d{3}$/.test(String(detectado.lote_ejemplo || "").trim()) ||
   /^1\s+\d{3}$/.test(String(detectado.lote_ejemplo || "").trim()))
) {
  detectado.lote_formato = "3 dígitos";
}

// ============================================================
// 1b. CHEQUEO CALIDAD DE FOTO (v1.5)
// ============================================================
// Auto-evaluación de la IA (calidad_foto) + chequeo defensivo por campos
// críticos vacíos. La IA a veces es optimista y dice "buena" cuando
// falta algún dato → forzamos "mala" si detectamos campos críticos ausentes.

const eanNoLegible = !detectado.ean_completo ||
                     String(detectado.ean_completo).toLowerCase() === "no_legible";
const fechaCaducidadVacia = !detectado.fecha_caducidad;
const loteNoDetectado = detectado.lote_formato === "no_detectado" || !detectado.lote_formato;

// Excepción: los productos SIN EAN (tipo_ean="sin_ean") tienen EAN vacío intencionadamente
// (GUFRESCO, ALABAU, ANTICH...). No forzamos "mala" solo por eso.
const esSinEanValido = detectado.tipo_ean === "sin_ean";

// Chequeo defensivo: si faltan datos críticos, forzar calidad_foto = "mala".
if ((eanNoLegible && !esSinEanValido) || fechaCaducidadVacia || loteNoDetectado) {
  detectado.calidad_foto = "mala";
}

// Si calidad es "mala" (por IA o defensivo), pedir REINTENTAR y salir.
if (detectado.calidad_foto === "mala") {
  return [{
    json: {
      error: true,
      clasificacion: "REINTENTAR",
      calidad_foto: "mala",
      mensaje_error:
        "La foto es de baja calidad y no se pueden leer los datos con fiabilidad " +
        "(EAN, fecha caducidad o lote ilegibles). Por favor, repite la foto asegurando: " +
        "(1) buena iluminación (evitar sombras y reflejos); " +
        "(2) enfoque nítido; " +
        "(3) etiqueta completa en el encuadre, no cortada.",
      detectado_en_etiqueta: detectado
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
const nombreSapRellenado = String(productoRellenado.nombre_sap || "").toUpperCase();
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

// EAN: comparamos prefijo rellenado (primeros 7) vs prefijo detectado.
// Lógica específica (no usa estadoComparacion genérica):
// - Ambos vacíos: OK (producto sin EAN coherente).
// - Rellenado vacío + detectado con valor: REVISAR (rellena BD).
// - Rellenado con valor + detectado vacío: DIFIERE (la foto no tiene EAN
//   pero el producto SÍ debería → probable foto equivocada).
// - Ambos con valor coincidentes: OK.
// - Ambos con valor distintos: DIFIERE (foto de otro producto o cliente).
const eanRellenado = String(productoRellenado.ean || "").trim();
const prefijoRellenado = eanRellenado.length >= 7 ? eanRellenado.substring(0, 7) : null;
const estadoEanPrefijo = (() => {
  const relEs = !prefijoRellenado;
  const detEs = !prefijoDetectado;
  if (relEs && detEs) return "OK";
  if (relEs && !detEs) return "REVISAR (rellena EAN en BD)";
  if (!relEs && detEs) return "DIFIERE (BD tiene EAN pero la foto no lo muestra)";
  if (prefijoRellenado === prefijoDetectado) return "OK";
  return "DIFIERE";
})();
comparaciones.push({
  campo: "ean_prefijo",
  valor_rellenado: prefijoRellenado || "(no rellenado)",
  valor_detectado: prefijoDetectado || "(no detectado)",
  estado: estadoEanPrefijo
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

// PRODUCTO DE TIPO NUEVO — no existe workflow específico
// Los únicos workflows productivos son piña y coco. Cualquier otro tipo
// (MELÓN, SANDÍA, MANGO, PAPAYA, KIWI...) requiere workflow nuevo.
const tipoProductoConocido = /PI[ÑN]A|COCO/i.test(nombreSapRellenado);
if (!tipoProductoConocido) {
  motivosExcepcion.push(
    `Producto de tipo nuevo. El nombre_sap "${productoRellenado.nombre_sap}" no incluye PIÑA ni COCO, ` +
    `que son los únicos workflows existentes. NO ACTIVAR el producto hasta: ` +
    `(1) confirmar con Antoni si se crea un workflow nuevo (posiblemente clonando piña); ` +
    `(2) crear el workflow en n8n y su Code node de identificación; ` +
    `(3) actualizar la sección "workflow_destino" del code de este análisis para reconocer el nuevo tipo.`
  );
}

// TACOS que NO son DELMONTE — requieren revisión del flujo (1-fase vs multi-fase)
// Hoy SOLO DELMONTE TACOS usa el flujo 3-fases (tarrina + film + caja).
// Otros TACOS (GUFRESCO, LIDL, etc.) son 1-fase pero conviene confirmarlo.
if (/TACOS/i.test(nombreSapRellenado) && !/DELMONTE/i.test(clienteRellenado)) {
  motivosExcepcion.push(
    `Producto TACOS pero cliente "${productoRellenado.cliente}" no es DELMONTE. ` +
    `Solo DELMONTE TACOS usa flujo 3-fases (tarrina + film + caja). Requiere: ` +
    `(1) confirmar con el cliente si su producto TACOS es 1-fase (bote/bolsa/tarrina normal) o multi-fase; ` +
    `(2) si es multi-fase, ampliar el workflow tacos-frontal para soportar este cliente; ` +
    `(3) si es 1-fase, verificar que la lógica de piña o coco lo cubre por el prefijo EAN.`
  );
}

// EAN prefijo no coincide (foto de producto distinto o foto sin EAN cuando BD sí lo tiene)
if (estadoEanPrefijo.startsWith("DIFIERE")) {
  motivosExcepcion.push(
    `Prefijo EAN no coincide entre BD y foto. Rellenado: "${prefijoRellenado || '(vacío)'}", ` +
    `detectado en foto: "${prefijoDetectado || '(vacío)'}". ` +
    `Verifica que la foto corresponde al producto que estás dando de alta.`
  );
}

// ============================================================
// LIDL CHEF SELECT TACOS nuevos (prefijo EAN 4335619)
// ============================================================
// Grupo de productos LIDL Chef Select "TACOS" (piña, coco, melón, sandía, mix)
// con EAN-13 fijo prefijo 4335619 y logo amarillo "RECICLA Al Amarillo" obligatorio.
// Requieren workflow productivo dedicado (pendiente crear: verifica-etiqueta-tacos-lidl).
// Se identifican por:
//  - Prefijo EAN 4335619 (en detectado o rellenado).
//  - O por nombre_sap "LIDL ... CHEF SELECT" + "TACOS".

const esLidlChefSelectTacos = (
  (/4335619/.test(prefijoDetectado || "") || /4335619/.test(prefijoRellenado || "")) ||
  (/LIDL/i.test(clienteRellenado) &&
   /CHEF\s*SELECT/i.test(nombreSapRellenado) &&
   /TACOS/i.test(nombreSapRellenado))
);

if (esLidlChefSelectTacos) {
  // Validación estricta: DEBE tener logo amarillo de reciclaje
  if (detectado.logo_reciclaje_amarillo === false) {
    motivosExcepcion.push(
      `Producto LIDL Chef Select TACOS (prefijo EAN 4335619) debe llevar el logo amarillo ` +
      `"RECICLA Al Amarillo" en la etiqueta, pero la IA NO lo detectó. Requiere: ` +
      `(1) verificar visualmente si la etiqueta lo lleva (por si la IA no lo vio bien); ` +
      `(2) si NO lo lleva, contactar con LIDL para que actualice el diseño antes de activar el producto.`
    );
  }
  // Nota: el workflow productivo 'verifica-etiqueta-tacos-lidl' ya existe en n8n
  // (creado 2026-07-21). Ver docs/workflows/tacos-lidl.js. La heurística cubierta
  // de más abajo (sección 4b) evita que este grupo dispare EXCEPCION por
  // "producto de tipo nuevo".
}

// ============================================================
// VALIDACIÓN INFO NUTRICIONAL - Mix LIDL Chef Select TACOS (v1.6)
// ============================================================
// Solo aplica al producto Mix (nombre_sap contiene MIX + prefijo 4335619 o
// EAN completo 4335619496316). Valores hardcoded según etiqueta oficial.
// Comparación EXACTA normalizada (sin margen numérico) para máxima seguridad
// sanitaria. Protege contra:
//  - Valor mal leído/impreso ("44" vs "43").
//  - Palabra borrada/no impresa (campo detectado como null).

const esMixLidlTacos = esLidlChefSelectTacos && /MIX/i.test(nombreSapRellenado);

if (esMixLidlTacos) {
  const INFO_NUTRICIONAL_MIX_ESPERADA = {
    valor_energetico_kj: "185",
    valor_energetico_kcal: "44",
    grasas_g: "0",
    grasas_saturadas_g: "0",
    hidratos_g: "10",
    azucares_g: "9,1",
    proteinas_g: "0,6",
    sal_g: "0"
  };

  // Normaliza un valor para comparación: quita unidades, espacios, y unifica decimal.
  function normalizarValorNutricional(v) {
    if (v === null || v === undefined || v === "") return "";
    return String(v)
      .replace(/kcal|kJ|kj/gi, "")
      .replace(/g\b/gi, "")
      .replace(/\s+/g, "")
      .replace(/\./g, ",")
      .trim();
  }

  const infoDet = detectado.info_nutricional || { visible: false };
  const erroresNutricional = [];

  // Chequeo global: si la IA no vio la sección → error crítico
  if (!infoDet.visible) {
    erroresNutricional.push(
      "La sección 'Información nutricional' NO se detectó en la etiqueta. El producto MIX " +
      "DEBE llevar tabla nutricional visible (por normativa alimentaria). Posible impresión " +
      "borrada o foto cortada. Repite la foto asegurando que se vea toda la etiqueta."
    );
  } else {
    // Chequeo campo por campo
    for (const campo in INFO_NUTRICIONAL_MIX_ESPERADA) {
      const esperado = INFO_NUTRICIONAL_MIX_ESPERADA[campo];
      const detectadoRaw = infoDet[campo];
      // Ausencia: palabra/valor borrado o no leído
      if (detectadoRaw === null || detectadoRaw === undefined || detectadoRaw === "") {
        erroresNutricional.push(
          `Campo '${campo}' NO detectado en la etiqueta (esperado: "${esperado}"). ` +
          `Posible impresión defectuosa o palabra borrada.`
        );
        continue;
      }
      // Comparación exacta normalizada
      if (normalizarValorNutricional(detectadoRaw) !== normalizarValorNutricional(esperado)) {
        erroresNutricional.push(
          `Valor de '${campo}' NO coincide con el oficial. Esperado: "${esperado}", ` +
          `detectado: "${detectadoRaw}". Posible impresión errónea o solapamiento con texto perimetral.`
        );
      }
    }
  }

  if (erroresNutricional.length > 0) {
    motivosExcepcion.push(
      `⚠️ VALIDACIÓN INFO NUTRICIONAL MIX FALLIDA (${erroresNutricional.length} error/es): ` +
      erroresNutricional.join(" | ") +
      ` — Verifica visualmente la etiqueta: puede que la impresión esté desplazada, se hayan ` +
      `solapado palabras con el texto perimetral, o falten campos. NO ACTIVAR/USAR hasta resolver.`
    );
  }
}

// ETIQUETA DE CAJA marcada — el análisis del bote NO cubre la etiqueta de la caja.
// La verificación de la caja se hace en el webhook separado
// `analisis-etiqueta-alta-CAJA` (misma URL base, sufijo -CAJA).
if (productoRellenado.etiqueta_de_caja === true) {
  motivosExcepcion.push(
    `Producto con etiqueta_de_caja=true. Este análisis SOLO cubre la etiqueta del bote/tarrina. ` +
    `Requiere hacer también el análisis de la CAJA en el webhook 'analisis-etiqueta-alta-CAJA' ` +
    `subiendo una foto de la etiqueta exterior de la caja. Ese análisis verificará si el ` +
    `workflow caja ya reconoce este cliente (patrones actuales: MERCADONA por código proveedor, ` +
    `ALDI/DELMONTE/CONSUM por DUN o formato).`
  );
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

// TACOS 1-fase para clientes ya conocidos — workflow coco/piña estándar
// Solo DELMONTE TACOS usa multi-fase 3-fases (tarrina + film + caja).
// Otros clientes conocidos (GUFRESCO, GELATS, OPCIO, LIDL) tienen TACOS
// en formato bote/bolsa normal → 1-fase, ya cubierto por workflow coco o piña.
if (
  /TACOS/i.test(nombreSapRellenado) &&
  !/DELMONTE/i.test(clienteRellenado) &&
  /GUFRESCO|GELATS|OPCIO|LIDL/i.test(clienteRellenado)
) {
  heuristicasCubiertas.push({
    workflow: /COCO/i.test(nombreSapRellenado) ? "coco" : "pina",
    heuristica: `TACOS 1-fase para ${productoRellenado.cliente} (bolsa/bote normal, workflow estándar)`,
    motivo_cubierto: "tacos_no_delmonte"
  });
}

// LIDL Chef Select TACOS nuevos (prefijo EAN 4335619) — workflow tacos-lidl productivo
// Los 5 SKUs (piña, coco, melón, sandía, mix) van al workflow productivo dedicado
// 'verifica-etiqueta-tacos-lidl' que ya existe (creado 2026-07-21).
// El código de App.vue enruta el prefijo 4335619 al webhook nuevo.
if (esLidlChefSelectTacos) {
  heuristicasCubiertas.push({
    workflow: "tacos-lidl",
    heuristica: "LIDL Chef Select TACOS por prefijo EAN 4335619 (workflow productivo dedicado)",
    motivo_cubierto: "tipo_producto_nuevo_lidl_tacos"
  });
}

// Motivos que quedan sin cubrir por heurística existente
const motivosNoCubiertos = motivosExcepcion.filter(m => {
  const esSinEan = /sin EAN legible/i.test(m);
  const esIdioma = /Idioma "/i.test(m);
  const esColisionPrefijo = /Prefijo EAN colisiona/i.test(m);
  const esTacosNoDelmonte = /TACOS pero cliente/i.test(m);
  const esTipoProductoNuevoGenerico = /Producto de tipo nuevo\. El nombre_sap/i.test(m);

  if (esSinEan && heuristicasCubiertas.some(h => h.motivo_cubierto === "sin_ean")) return false;
  if (esIdioma && heuristicasCubiertas.some(h => h.motivo_cubierto === "idioma_catalan")) return false;
  if (esColisionPrefijo && heuristicasCubiertas.some(h => h.motivo_cubierto === "colision_prefijo_LIDL")) return false;
  if (esTacosNoDelmonte && heuristicasCubiertas.some(h => h.motivo_cubierto === "tacos_no_delmonte")) return false;
  // LIDL Chef Select TACOS nuevos ya tienen su propio motivo específico (más detallado).
  // Silenciamos el motivo genérico "producto de tipo nuevo" para evitar duplicación.
  if (esTipoProductoNuevoGenerico && esLidlChefSelectTacos) return false;

  return true;
});

const clasificacion = motivosNoCubiertos.length === 0 ? "ESTANDAR" : "EXCEPCION";

// ============================================================
// 5. DETERMINAR WORKFLOW DESTINO
// ============================================================

let workflowDestino = "pina";
if (/COCO/.test(nombreSapRellenado)) workflowDestino = "coco";
// LIDL Chef Select TACOS nuevos → workflow productivo dedicado
if (esLidlChefSelectTacos) workflowDestino = "tacos-lidl";

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

// Aviso de calidad de foto regular (v1.5)
if (detectado.calidad_foto === "regular") {
  notas.push(
    "⚠️ Foto con calidad REGULAR — algunos datos pueden tener dudas (dígitos ambiguos, " +
    "sombras parciales, enfoque flojo). Verifica manualmente los campos detectados antes " +
    "de activar el producto. Si dudas, repite la foto con mejor luz/enfoque."
  );
}

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
