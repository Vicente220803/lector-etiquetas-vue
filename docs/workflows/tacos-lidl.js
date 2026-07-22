/**
 * NODO: Code JavaScript - VERIFICA ETIQUETA TACOS LIDL
 * Versión: 1.0
 * ultima_actualizacion: 2026-07-21
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
if (detectado.calidad_foto === "mala") {
  return [{
    json: {
      resultado_v: "REINTENTAR",
      cliente: "REINTENTAR",
      mensaje_error: "Foto de baja calidad. Por favor, repite con mejor luz, enfoque y encuadre.",
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
        producto_bd: producto_bd.nombre_sap,
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
      ean_leido: eanCompleto,
      mensaje_error: `El producto LIDL Chef Select TACOS "${producto_bd.nombre_sap}" DEBE llevar el logo amarillo "RECICLA Al Amarillo" en la etiqueta, pero NO se detectó. Verifica visualmente y NO continúes si falta.`
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
        ean_leido: eanCompleto,
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
      ean_leido: eanCompleto,
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

// P+X esperado según día de la semana de la fecha de referencia (BD)
const diaSemana = fechaReferencia.getDay(); // 0=domingo, 1=lunes...
let px_esperado;
if (diaSemana === 4) {
  px_esperado = producto_bd.p_x_j || producto_bd.p_x_d_l_m_x;
} else if (diaSemana === 5) {
  px_esperado = producto_bd.p_x_v || producto_bd.p_x_d_l_m_x;
} else {
  px_esperado = producto_bd.p_x_d_l_m_x;
}

const px_ok = Number(px_leido) === Number(px_esperado);

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
    producto_id: producto_bd.id,
    ean_leido: eanCompleto,
    fecha_caducidad: detectado.fecha_caducidad,
    fecha_caducidad_iso: fechaCaducidad.toISOString().slice(0, 10),
    fecha_referencia_iso: fechaReferencia.toISOString().slice(0, 10),
    lote: lote,
    peso_neto: detectado.peso_neto || null,
    origen: detectado.origen || null,
    producto_texto: detectado.producto_texto || null,
    logo_reciclaje_amarillo: true,
    info_nutricional: detectado.info_nutricional || null,
    info_nutricional_ok: esMix ? true : "N/A",
    px_leido: px_leido,
    px_esperado: px_esperado,
    px_ok: px_ok,
    calidad_foto: detectado.calidad_foto || "buena",
    mensaje: px_ok
      ? `Etiqueta OK. Producto: ${producto_bd.nombre_sap}. P+X: ${px_leido} días (esperado ${px_esperado}).`
      : `P+X detectado (${px_leido}) NO coincide con esperado (${px_esperado}). Verifica fecha de caducidad y fecha de producción.`
  }
}];
