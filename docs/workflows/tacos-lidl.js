/**
 * NODO: Code JavaScript - VERIFICA ETIQUETA TACOS LIDL
 * Versión: 1.6
 * ultima_actualizacion: 2026-07-23
 *
 * v1.6 — Fix BUG real: chequeo de calidad_foto defensivo. Antes solo se
 *   confiaba en que la IA dijera calidad_foto="mala"; si decía "buena"
 *   pero devolvía ean_completo="no_legible", caía en el mensaje confuso
 *   "prefijo EAN no corresponde" (sección 3) en vez de pedir repetir la
 *   foto. Ahora se fuerza calidad_foto="mala" si EAN/fecha_caducidad/lote
 *   vienen vacíos, igual que ya hacía analisis-etiqueta-alta.js.
 *
 * v1.5 — Validación cruzada del pictograma "No apto 0-3 años": ahora
 *   también bloquea si aparece en piña/melón/sandía/mix (donde NO debería
 *   estar). Antes solo se exigía que el Coco lo llevara; el caso inverso
 *   (aparece donde no toca) es señal de mezcla de plancha/molde de
 *   impresión entre SKUs — posible etiqueta mal impresa.
 *
 * v1.4 — Añadido campo `fecha_envasado` en la respuesta final. La etiqueta
 *   NO imprime fecha de envasado (solo caducidad DD/MM), pero se muestra
 *   la fecha_produccion de la orden (ya usada internamente para el P+X)
 *   para dar trazabilidad en la app del compa, que antes mostraba "—".
 *
 * v1.3 — Fix BUG real: App.vue no mostraba Producto ni EAN en pantalla
 *   ("¡COINCIDE!"). Causa: App.vue lee `producto_db` y `ean`/`ean_bd`
 *   (los nombres que usan pina.js/coco.js), pero este workflow solo
 *   mandaba `producto_bd` y `ean_leido` — nombres distintos, campos
 *   vacíos en pantalla. Fix: se añaden `producto_db`, `ean` y `ean_bd`
 *   como alias en TODAS las respuestas (éxito y error), manteniendo los
 *   nombres originales por si algo más los usa.
 *
 * v1.2 — P+X migrado a rango p_x_min/p_x_max (antes p_x_d_l_m_x/p_x_j/p_x_v
 *   por día de la semana). Los 5 SKUs ya tienen el rango relleno en BD
 *   (coco: 8-10, resto: 6-8).
 *
 * v1.1 — Validación pictograma "No apto 0-3 años" (riesgo asfixia),
 *   obligatorio SOLO en el SKU Coco (id=74). Requiere prompt v1.6 con
 *   campo pictograma_no_apto_0_3.
 *
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 *
 * PROPÓSITO: Workflow productivo para el grupo LIDL Chef Select TACOS
 * (5 productos: piña, coco, melón, sandía, mix). Todos comparten:
 *   - Prefijo EAN 4335619 (GS1 Alemania, EAN-13 fijo por producto).
 *   - Peso fijo (230g o 150g coco).
 *   - Lote formato "1 XXX" (1 fijo + 3 dígitos julianos).
 *   - Fecha caducidad "DD/MM" (sin año, asumir año actual/siguiente).
 *   - Logo amarillo "RECICLA Al Amarillo" OBLIGATORIO.
 *   - Solo el Mix incluye tabla nutricional (validación estricta).
 *
 * Recibe (en $('Webhook').item.json.body):
 *   - producto: nombre_sap del producto que envía el padre (HojaFabricacion).
 *   - cliente: "LIDL SUPERMERCADOS, S.A.U".
 *   - fecha_produccion: "YYYY-MM-DD" ISO (opcional; si no viene, usa hoy).
 *   - px_usuario: P+X que el operario introdujo manualmente (opcional).
 *
 * Recibe (en $('Analyze image').item.json): JSON de la IA con el mismo
 * formato que el prompt bote v1.4 (ean_completo, fecha_caducidad, lote_ejemplo,
 * logo_reciclaje_amarillo, calidad_foto, info_nutricional...).
 *
 * Recibe (en $('Get many rows').all()): productos activos de BD.
 *
 * Devuelve JSON con estructura compatible con App.vue.
 */

// ============================================================
// 1. PARSING
// ============================================================

let iaFalloTotalmente = false;
let mensajeDetalladoIA = "";
let openaiOutput;

const datosApp = $('Webhook').item.json.body || {};
const producto_hint = String(datosApp.producto || "").toUpperCase().trim();
const cliente_hint = String(datosApp.cliente || "").toUpperCase().trim();
const fecha_produccion_str = datosApp.fecha_produccion || null;
const pxUsuario = datosApp.px_usuario || "No indicado";

try {
  const inputIA = $('Analyze image').item;
  if (!inputIA || inputIA.json.error) {
    iaFalloTotalmente = true;
    mensajeDetalladoIA = inputIA?.json?.error?.message || "La IA no devolvió datos.";
  } else {
    openaiOutput = inputIA.json;
    if (Array.isArray(openaiOutput)) openaiOutput = openaiOutput[0];
  }
} catch (e) {
  iaFalloTotalmente = true;
  mensajeDetalladoIA = "Error crítico de conexión entre nodos de n8n.";
}

if (iaFalloTotalmente) {
  return [{
    json: {
      bloqueo_ia: true,
      error_sanitario: true,
      mensaje_error: mensajeDetalladoIA,
      resultado_v: "FALLO IA",
      cliente: "REINTENTAR"
    }
  }];
}

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

fullText = fullText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

let detectado;
try {
  detectado = JSON.parse(fullText);
} catch (e) {
  return [{
    json: {
      bloqueo_ia: true,
      error_sanitario: true,
      mensaje_error: "La IA no devolvió JSON válido: " + String(e),
      raw_ia: fullText,
      resultado_v: "FALLO IA",
      cliente: "REINTENTAR"
    }
  }];
}

// ============================================================
// 2. CHEQUEO CALIDAD FOTO
// ============================================================
// No nos fiamos ciegamente de la auto-evaluación de la IA (calidad_foto):
// a veces dice "buena" mientras devuelve ean_completo="no_legible", y eso
// antes caía en el mensaje confuso de "prefijo no corresponde" (sección 3)
// en vez de pedir repetir la foto. Chequeo defensivo por campos críticos
// vacíos, igual que en analisis-etiqueta-alta.js.
const eanNoLegible = !detectado.ean_completo ||
                     String(detectado.ean_completo).toLowerCase().includes("no_legible");
const fechaCaducidadVacia = !detectado.fecha_caducidad;
const loteNoDetectado = !detectado.lote_ejemplo;

if (eanNoLegible || fechaCaducidadVacia || loteNoDetectado) {
  detectado.calidad_foto = "mala";
}

if (detectado.calidad_foto === "mala") {
  return [{
    json: {
      resultado_v: "REINTENTAR",
      cliente: "REINTENTAR",
      mensaje_error: "La foto es de baja calidad y no se pueden leer los datos con fiabilidad " +
        "(EAN, fecha de caducidad o lote ilegibles). Por favor, repite la foto asegurando: " +
        "(1) buena iluminación (evitar sombras y reflejos); " +
        "(2) enfoque nítido; " +
        "(3) etiqueta completa en el encuadre, no cortada.",
      calidad_foto: "mala"
    }
  }];
}

// ============================================================
// 3. IDENTIFICACIÓN POR PREFIJO EAN
// ============================================================
const eanCompleto = String(detectado.ean_completo || "").replace(/\s/g, "");
const eanPrefijo = eanCompleto.substring(0, 7);

if (eanPrefijo !== "4335619") {
  return [{
    json: {
      resultado_v: "ERROR",
      error_sanitario: true,
      cliente: "ERROR",
      mensaje_error: `Etiqueta con prefijo EAN "${eanPrefijo}" NO corresponde a LIDL Chef Select TACOS (prefijo esperado: 4335619). Verifica que el producto es correcto.`
    }
  }];
}

// ============================================================
// 4. CROSS-CHECK CON BD - identificar SKU exacto
// ============================================================
const productosDB = $('Get many rows').all().map(it => it.json);
const producto_bd = productosDB.find(p =>
  String(p.ean || "").replace(/\s/g, "").trim() === eanCompleto
);

if (!producto_bd) {
  return [{
    json: {
      resultado_v: "ERROR",
      error_sanitario: true,
      cliente: "LIDL SUPERMERCADOS, S.A.U",
      ean_leido: eanCompleto,
      ean: eanCompleto,
      mensaje_error: `EAN completo ${eanCompleto} NO encontrado en la BD de productos. Verifica el maestro de productos o contacta con el equipo técnico.`
    }
  }];
}

// Barrera: producto_hint (del padre) vs producto_bd (por EAN)
if (producto_hint && producto_hint.length > 0) {
  const nombreSapBd = String(producto_bd.nombre_sap || "").toUpperCase();
  if (!nombreSapBd.includes(producto_hint) && !producto_hint.includes(nombreSapBd)) {
    return [{
      json: {
        resultado_v: "ERROR",
        error_sanitario: true,
        cliente: "LIDL SUPERMERCADOS, S.A.U",
        ean_leido: eanCompleto,
        ean: eanCompleto,
        ean_bd: producto_bd.ean,
        producto_bd: producto_bd.nombre_sap,
        producto_db: producto_bd.nombre_sap,
        producto_esperado: producto_hint,
        mensaje_error: `EAN escaneado corresponde a "${producto_bd.nombre_sap}" pero la orden esperaba "${producto_hint}". Etiqueta EQUIVOCADA — no continuar.`
      }
    }];
  }
}

// ============================================================
// 5. VALIDACIÓN LOGO AMARILLO (obligatorio para todo el grupo)
// ============================================================
if (detectado.logo_reciclaje_amarillo === false || detectado.logo_reciclaje_amarillo === null) {
  return [{
    json: {
      resultado_v: "ERROR",
      error_sanitario: true,
      cliente: "LIDL SUPERMERCADOS, S.A.U",
      producto_bd: producto_bd.nombre_sap,
      producto_db: producto_bd.nombre_sap,
      ean_leido: eanCompleto,
      ean: eanCompleto,
      ean_bd: producto_bd.ean,
      mensaje_error: `El producto LIDL Chef Select TACOS "${producto_bd.nombre_sap}" DEBE llevar el logo amarillo "RECICLA Al Amarillo" en la etiqueta, pero NO se detectó. Verifica visualmente y NO continúes si falta.`
    }
  }];
}

// ============================================================
// 5b. VALIDACIÓN PICTOGRAMA NO APTO 0-3 AÑOS (obligatorio solo Coco)
// ============================================================
// Riesgo de asfixia por trozos duros de coco — solo esta variante lo lleva
// de las 5 (piña, coco, melón, sandía, mix). Requiere prompt v1.6 con el
// campo pictograma_no_apto_0_3.
const esCoco = /COCO/i.test(producto_bd.nombre_sap);
if (esCoco && (detectado.pictograma_no_apto_0_3 === false || detectado.pictograma_no_apto_0_3 === null || detectado.pictograma_no_apto_0_3 === undefined)) {
  return [{
    json: {
      resultado_v: "ERROR",
      error_sanitario: true,
      cliente: "LIDL SUPERMERCADOS, S.A.U",
      producto_bd: producto_bd.nombre_sap,
      producto_db: producto_bd.nombre_sap,
      ean_leido: eanCompleto,
      ean: eanCompleto,
      ean_bd: producto_bd.ean,
      mensaje_error: `El producto "${producto_bd.nombre_sap}" DEBE llevar el pictograma "No apto para menores de 3 años" (riesgo de asfixia) en la etiqueta, pero NO se detectó. Verifica visualmente y NO continúes si falta.`
    }
  }];
}
// Caso inverso: el pictograma es EXCLUSIVO del Coco (riesgo de asfixia por
// trozos duros). Si aparece en piña/melón/sandía/mix, es señal de mezcla de
// plancha/molde de impresión con el Coco — posible etiqueta mal impresa.
if (!esCoco && detectado.pictograma_no_apto_0_3 === true) {
  return [{
    json: {
      resultado_v: "ERROR",
      error_sanitario: true,
      cliente: "LIDL SUPERMERCADOS, S.A.U",
      producto_bd: producto_bd.nombre_sap,
      producto_db: producto_bd.nombre_sap,
      ean_leido: eanCompleto,
      ean: eanCompleto,
      ean_bd: producto_bd.ean,
      mensaje_error: `El producto "${producto_bd.nombre_sap}" NO debería llevar el pictograma "No apto para menores de 3 años" (ese aviso es exclusivo del Coco, por riesgo de trozos duros). Se ha detectado en esta etiqueta — posible error de impresión (plancha/molde mezclada con el Coco). Verifica visualmente y NO continúes si es así.`
    }
  }];
}

// ============================================================
// 6. VALIDACIÓN INFO NUTRICIONAL (solo Mix)
// ============================================================
const esMix = /MIX/i.test(producto_bd.nombre_sap);
if (esMix) {
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

  if (!infoDet.visible) {
    erroresNutricional.push(
      "Tabla nutricional NO detectada en la etiqueta del Mix (obligatoria por normativa)."
    );
  } else {
    for (const campo in INFO_NUTRICIONAL_MIX_ESPERADA) {
      const esperado = INFO_NUTRICIONAL_MIX_ESPERADA[campo];
      const detectadoRaw = infoDet[campo];
      if (detectadoRaw === null || detectadoRaw === undefined || detectadoRaw === "") {
        erroresNutricional.push(`Campo '${campo}' NO detectado (esperado: "${esperado}").`);
        continue;
      }
      if (normalizarValorNutricional(detectadoRaw) !== normalizarValorNutricional(esperado)) {
        erroresNutricional.push(`'${campo}': esperado "${esperado}", detectado "${detectadoRaw}".`);
      }
    }
  }

  if (erroresNutricional.length > 0) {
    return [{
      json: {
        resultado_v: "ERROR",
        error_sanitario: true,
        cliente: "LIDL SUPERMERCADOS, S.A.U",
        producto_bd: producto_bd.nombre_sap,
        producto_db: producto_bd.nombre_sap,
        ean_leido: eanCompleto,
        ean: eanCompleto,
        ean_bd: producto_bd.ean,
        mensaje_error: `Validación info nutricional del Mix FALLIDA (${erroresNutricional.length} error/es): ` +
          erroresNutricional.join(" | ") +
          ` — Posible impresión defectuosa. Verifica visualmente la etiqueta antes de continuar.`
      }
    }];
  }
}

// ============================================================
// 7. VALIDACIÓN FECHA CADUCIDAD Y CÁLCULO P+X
// ============================================================
function parseFechaCaducidad(str) {
  if (!str) return null;
  // Formato "DD/MM" (sin año) — asumir año actual, o siguiente si ya pasó.
  const parts = String(str).trim().split(/[./-]/);
  if (parts.length < 2) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const anyoActual = new Date().getFullYear();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let fecha = new Date(anyoActual, m, d);
  if (fecha < hoy) fecha.setFullYear(anyoActual + 1);
  return fecha;
}

const fechaCaducidad = parseFechaCaducidad(detectado.fecha_caducidad);
if (!fechaCaducidad) {
  return [{
    json: {
      resultado_v: "ERROR",
      error_sanitario: true,
      cliente: "LIDL SUPERMERCADOS, S.A.U",
      producto_bd: producto_bd.nombre_sap,
      producto_db: producto_bd.nombre_sap,
      ean_leido: eanCompleto,
      ean: eanCompleto,
      ean_bd: producto_bd.ean,
      mensaje_error: `Fecha de caducidad "${detectado.fecha_caducidad}" NO se pudo interpretar. Formato esperado: DD/MM.`
    }
  }];
}

// Fecha de referencia: la de producción de la orden (si viene) o hoy.
let fechaReferencia;
if (fecha_produccion_str) {
  fechaReferencia = new Date(fecha_produccion_str);
  if (isNaN(fechaReferencia.getTime())) {
    fechaReferencia = new Date();
  }
  fechaReferencia.setHours(0, 0, 0, 0);
} else {
  fechaReferencia = new Date();
  fechaReferencia.setHours(0, 0, 0, 0);
}

const MS_DIA = 1000 * 60 * 60 * 24;
const px_leido = Math.round((fechaCaducidad - fechaReferencia) / MS_DIA);

// P+X esperado: rango tolerado [p_x_min, p_x_max] del producto en BD.
const px_min = Number(producto_bd.p_x_min);
const px_max = Number(producto_bd.p_x_max);
const px_ok = Number(px_leido) >= px_min && Number(px_leido) <= px_max;

// ============================================================
// 8. LOTE (informativo, no bloqueante)
// ============================================================
const lote = detectado.lote_ejemplo || null;

// ============================================================
// 9. RESPUESTA FINAL
// ============================================================
return [{
  json: {
    resultado_v: px_ok ? "OK" : "DIFIERE_PX",
    cliente: "LIDL SUPERMERCADOS, S.A.U",
    producto_bd: producto_bd.nombre_sap,
    producto_db: producto_bd.nombre_sap,
    producto_id: producto_bd.id,
    ean_leido: eanCompleto,
    ean: eanCompleto,
    ean_bd: producto_bd.ean,
    fecha_caducidad: detectado.fecha_caducidad,
    fecha_caducidad_iso: fechaCaducidad.toISOString().slice(0, 10),
    // La etiqueta NO imprime fecha de envasado (solo caducidad DD/MM).
    // Mostramos la fecha_produccion de la orden (o "hoy" si no llegó) para
    // que quede trazabilidad de qué fecha se usó como referencia del P+X.
    fecha_envasado: `${String(fechaReferencia.getDate()).padStart(2, '0')}/${String(fechaReferencia.getMonth() + 1).padStart(2, '0')}/${fechaReferencia.getFullYear()}`,
    fecha_referencia_iso: fechaReferencia.toISOString().slice(0, 10),
    lote: lote,
    peso_neto: detectado.peso_neto || null,
    origen: detectado.origen || null,
    producto_texto: detectado.producto_texto || null,
    logo_reciclaje_amarillo: true,
    pictograma_no_apto_0_3: esCoco ? true : (detectado.pictograma_no_apto_0_3 ?? null),
    info_nutricional: detectado.info_nutricional || null,
    info_nutricional_ok: esMix ? true : "N/A",
    px_leido: px_leido,
    px_min: px_min,
    px_max: px_max,
    px_ok: px_ok,
    calidad_foto: detectado.calidad_foto || "buena",
    mensaje: px_ok
      ? `Etiqueta OK. Producto: ${producto_bd.nombre_sap}. P+X: ${px_leido} días (rango esperado ${px_min}-${px_max}).`
      : `P+X detectado (${px_leido}) fuera del rango esperado (${px_min}-${px_max}). Verifica fecha de caducidad y fecha de producción.`
  }
}];
