/**
 * NODO: Code JavaScript - ANALISIS DE ETIQUETAS coco
 * Versión: 8.6 - P+X migrado a rango p_x_min/p_x_max (antes p_x_d_l_m_x/p_x_j/p_x_v)
 * ultima_actualizacion: 2026-07-22
 *
 * v8.6 — P+X ya no depende del día de la semana. Se valida como rango
 *   tolerado [p_x_min, p_x_max] leído directamente del producto en BD.
 *   Las columnas viejas (p_x_d_l_m_x, p_x_j, p_x_v) siguen en BD pero
 *   el código ya no las lee.
 *
 * v8.5 — Este workflow NO es la ruta primaria para LIDL Chef Select TACOS
 *   (App.vue enruta esos 5 SKUs al workflow dedicado tacos-lidl.js, que sí
 *   valida logo amarillo, pictograma 0-3 e info nutricional del Mix).
 *   Este cambio es solo defensa-en-profundidad: si por lo que sea la foto
 *   llega aquí, que al menos identifique el producto y el lote correctamente
 *   (fecha DD/MM ya funcionaba genérico, no requería cambios). NO se han
 *   añadido aquí las validaciones estrictas de logo/pictograma — ese
 *   workflow no tiene infraestructura de campos booleanos IA (usa regex
 *   sobre texto plano, no JSON estructurado); si se quiere replicarlas aquí
 *   haría falta ver el prompt actual del nodo Analyze image de este workflow.
 *
 * v8.4 - GUFRESCO requiere lote 3 dígitos (no se activa con DELMONTE coco) + Barrera EAN-cliente + Barrera producto
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 */

let iaFalloTotalmente = false;
let mensajeDetalladoIA = "";
let openaiOutput;

const datosApp = $('Webhook').item.json.body;
const pxMarcadoPorUsuario = datosApp.px_usuario || "No indicado";
const accion = datosApp.accion || "analizar";
// Verify mode: la orden manda el cliente directamente (autoridad)
const clienteHint = (datosApp.cliente || "").toUpperCase().trim();

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

const productosDB = $('Get many rows').all();
const ahora = new Date();
const hoyParaCalculo = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

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

const cleanedText = fullText.replace(/\n/g, '  ').replace(/\s+/g, ' ').trim();
const upperText = cleanedText.toUpperCase();

function extractValue(text, regex, group = 1) {
  const match = text.match(regex);
  return match ? match[group].trim() : null;
}

function parseFecha(str) {
  if (!str) return null;
  const parts = str.split(/[./-]/);
  if (parts.length === 2) {
    let d = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1;
    const anyo = new Date().getFullYear();
    const fecha = new Date(anyo, m, d);
    if (fecha < hoyParaCalculo) fecha.setFullYear(anyo + 1);
    return fecha;
  }
  if (parts.length !== 3) return null;
  let d = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, y = parseInt(parts[2], 10);
  if (y < 100) y += 2000;
  return new Date(y, m, d);
}

const precioExtraido = extractValue(cleanedText, /(\d+[,.]\d{2})\s*€\/Kg/i) ||
                       extractValue(cleanedText, /Precio[:\s]*(\d+[,.]\d{2})/i) || "0.00";

let pesoExtraido = "0.000";
const pesoKgMatch = cleanedText.match(/(\d+[,.]\d{1,3})\s*Kg/i);
const pesoGMatch = cleanedText.match(/\b(\d{2,4})\s*g\b/i);
const pesoLabelMatch = cleanedText.match(/Peso neto[:\s]*(\d+(?:[,.]\d+)?)\s*(kg|g)?/i);

if (pesoKgMatch) {
  pesoExtraido = pesoKgMatch[1];
} else if (pesoGMatch) {
  pesoExtraido = (parseFloat(pesoGMatch[1]) / 1000).toFixed(3);
} else if (pesoLabelMatch) {
  const valor = parseFloat(pesoLabelMatch[1].replace(',', '.'));
  const unidad = (pesoLabelMatch[2] || 'kg').toLowerCase();
  pesoExtraido = unidad === 'g' ? (valor / 1000).toFixed(3) : valor.toFixed(3);
}

const importeExtraido = extractValue(cleanedText, /IMPORTE[:\s]*(\d+[,.]\d{2})\s*€/i) ||
                        extractValue(cleanedText, /IMPORTE[:\s]*(\d+[,.]\d{2})/i) || "0.00";

let origenIA = extractValue(cleanedText, /ORIGEN:?\s*([^:;0-9\n]+?)(?=\s*(?:ELABORADO|LOTE|LOT|FECHA|PESO|PRECIO|CONSERVAR|$))/i);

if (!origenIA && /\bno\s*u\.?e\.?\b/i.test(cleanedText)) {
  origenIA = "No UE";
}

if (!origenIA) origenIA = "Costa Rica";

let loteIA = extractValue(cleanedText, /Lote:?\s*([\d\s]{6,20})/i) || "No detectado";

if (loteIA !== "No detectado") {
  const partes = loteIA.trim().split(/\s+/);
  if (partes.length >= 2 && new RegExp(`\\b${partes[partes.length - 1]}\\s*g\\b`, 'i').test(cleanedText)) {
    partes.pop();
    loteIA = partes.join(' ');
  }
}

const codigoRIA = extractValue(cleanedText, /(R[-\s]?\d{1,2})/i, 0) || "N/A";

// === EAN OCR ===
const prefijosValidos = [...new Set(
  productosDB
    .map(p => String(p.json.ean || ""))
    .filter(e => e.length >= 7)
    .map(e => e.substring(0, 7))
)];

let eanOcrLimpio = "No detectado";

const buscarEan = (texto, longitudObjetivo) => {
  const candidatos = texto.match(/\d[\d\s\-]{6,30}\d/g) || [];
  for (const raw of candidatos) {
    const limpio = raw.replace(/[\s\-]+/g, '');
    for (let i = 0; i <= limpio.length - longitudObjetivo; i++) {
      const ventana = limpio.substring(i, i + longitudObjetivo);
      if (prefijosValidos.some(p => ventana.startsWith(p))) {
        return ventana;
      }
    }
  }
  return null;
};

eanOcrLimpio = buscarEan(cleanedText, 13) || buscarEan(cleanedText, 8) || "No detectado";

const fechaEnvasadaIA = extractValue(cleanedText, /Fecha[:\s]*(?:de[:\s]*)?[Ee]nvasad[ao][:\s]*(\d{2}[./-]\d{2}[./-]\d{2,4})/i);
const fechaEnvIA = extractValue(cleanedText, /Fecha Env[:\s]*(\d{2}[./-]\d{2}[./-]\d{2,4})/i);
const fechaCadIA = extractValue(cleanedText, /(?:Fecha Cad|caducidad)[:\s]*(\d{2}[./-]\d{2}[./-]\d{2,4})/i)
                || extractValue(cleanedText, /(?:Fecha Cad|caducidad)[:\s]*(\d{2}[./-]\d{2})/i);

// === IDENTIFICAR CLIENTE ===
const esActivoTemp = (v) => v === true || String(v).toUpperCase() === "TRUE" || v === 1 || v === "1";
let pDbTemp;
if (eanOcrLimpio !== "No detectado") {
  pDbTemp = productosDB.find(p =>
    String(p.json.ean || "") === eanOcrLimpio &&
    esActivoTemp(p.json.en_activo)
  )?.json;
  if (!pDbTemp && eanOcrLimpio.length >= 7) {
    pDbTemp = productosDB.find(p =>
      String(p.json.ean || "").substring(0, 7) === eanOcrLimpio.substring(0, 7) &&
      esActivoTemp(p.json.en_activo)
    )?.json;
  }
}

let clienteFinal = (pDbTemp && pDbTemp.cliente) ? pDbTemp.cliente.toUpperCase() : "OTROS";

// === BARRERA SANITARIA: EAN del bote vs cliente-hint de la orden ===
// Si el EAN leído pertenece a otro cliente distinto al que el padre dice que
// es la orden, el operario ha escaneado un bote equivocado. Bloqueamos.
// Comparación FLEXIBLE (uno contiene al otro) para que cuadren variantes
// como "CONSUM" en BD vs "CONSUM S. COOP. V." en orden.
if (clienteHint && pDbTemp && pDbTemp.cliente && eanOcrLimpio !== "No detectado") {
  const matchClienteFlex = (a, b) => {
    if (!a || !b) return false;
    const an = String(a).toUpperCase().trim();
    const bn = String(b).toUpperCase().trim();
    return an === bn || an.includes(bn) || bn.includes(an);
  };
  const matchBote = matchClienteFlex(pDbTemp.cliente, clienteHint);
  const matchAlias = matchClienteFlex(pDbTemp.cliente_alias, clienteHint);
  if (!matchBote && !matchAlias) {
    return [{
      json: {
        bloqueo_ia: true,
        error_sanitario: true,
        mensaje_error: `BOTE EQUIVOCADO: el EAN ${eanOcrLimpio} pertenece a ${pDbTemp.cliente}, pero la orden es de ${clienteHint}. Verifica que el bote sea correcto.`,
        cliente: "REINTENTAR",
        debug_texto_ocr: cleanedText,
        ean: eanOcrLimpio,
        ean_bd_detectado: pDbTemp.ean,
        cliente_bote_detectado: pDbTemp.cliente,
        cliente_hint_orden: clienteHint
      }
    }];
  }
}

if (clienteFinal === "OTROS" && upperText.includes("FECHA ENV")) {
  clienteFinal = "MERCADONA SA";
}

// Prioridad para dReferencia (fecha real de envasado):
//   1. fecha_produccion de la orden (HojaFabricacion la envía con la fecha real)
//   2. fecha_envasado del OCR (caso MERCADONA, que sí la imprime)
//   3. hoy (fallback final)
const fechaProduccionApp = datosApp.fecha_produccion || null;
let dReferencia;
if (fechaProduccionApp) {
    const partsFp = fechaProduccionApp.split('-');
    if (partsFp.length === 3) {
        const y = parseInt(partsFp[0], 10);
        const m = parseInt(partsFp[1], 10) - 1;
        const d = parseInt(partsFp[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            dReferencia = new Date(y, m, d);
        } else {
            dReferencia = hoyParaCalculo;
        }
    } else {
        dReferencia = hoyParaCalculo;
    }
} else if (clienteFinal === "MERCADONA SA" && fechaEnvIA) {
  dReferencia = parseFecha(fechaEnvIA);
} else {
  dReferencia = hoyParaCalculo;
}

const dCad = parseFecha(fechaCadIA);

const activos = productosDB.filter(p => {
  const v = p.json.en_activo;
  return v === true || String(v).toUpperCase() === "TRUE" || v === 1 || v === "1";
});

const esActivo = (v) => v === true || String(v).toUpperCase() === "TRUE" || v === 1 || v === "1";

let pDb = null;

// 1. Prioridad: cliente desde la orden (verify mode) → autoridad directa
//    Como este es el workflow COCO, filtramos solo SKUs con "COCO" en nombre_sap
if (clienteHint) {
  pDb = activos.find(p =>
    String(p.json.cliente || "").toUpperCase() === clienteHint &&
    /COCO/i.test(String(p.json.nombre_sap || "")) &&
    esActivo(p.json.en_activo)
  )?.json;
  if (pDb) clienteFinal = pDb.cliente.toUpperCase();
}

// 2. Fallback OCR: auto-mode o cliente no en BD → match exacto primero, luego prefijo 7
if (!pDb) {
  pDb = activos.find(p =>
    String(p.json.ean || "") === eanOcrLimpio &&
    esActivo(p.json.en_activo)
  )?.json;
  if (!pDb && eanOcrLimpio !== "No detectado" && eanOcrLimpio.length >= 7) {
    pDb = activos.find(p =>
      String(p.json.ean || "").substring(0, 7) === eanOcrLimpio.substring(0, 7) &&
      esActivo(p.json.en_activo)
    )?.json;
  }
}

// === FALLBACKS HEURÍSTICOS ===
if (!pDb && clienteFinal === "OTROS") {
  const origenGufresco = /ORIGEN:?\s*(India|Costa\s+de\s+Marfil)/i.test(cleanedText);
  const esDelMonte = /DEL\s*MONTE/i.test(cleanedText);
  // GUFRESCO usa lote EXACTAMENTE de 3 dígitos (día juliano). Si el lote
  // es de 6 dígitos = es DELMONTE u otro cliente, NO GUFRESCO.
  const tieneLote3 = /Lote:?\s*\d{3}(?!\d)/i.test(cleanedText);

  if (esDelMonte) {
    const esCoco = /COCO\s+TROCEADO|COCO\s+DEL\s+MONTE/i.test(cleanedText);
    const esPinaTacos = /PI[ÑN]A\s+TACOS|PI[ÑN]A\s+TROCEADA/i.test(cleanedText);
    const esPinaRodajas = /PI[ÑN]A\s+RODAJAS/i.test(cleanedText);

    if (esCoco) {
      pDb = activos.find(p =>
        String(p.json.cliente || "").toUpperCase() === "DELMONTE" &&
        /COCO/i.test(p.json.nombre_sap || "")
      )?.json;
    } else if (esPinaTacos) {
      pDb = activos.find(p =>
        String(p.json.cliente || "").toUpperCase() === "DELMONTE" &&
        /TACOS|TROCEADA/i.test(p.json.nombre_sap || "")
      )?.json;
    } else if (esPinaRodajas) {
      pDb = activos.find(p =>
        String(p.json.cliente || "").toUpperCase() === "DELMONTE" &&
        /RODAJAS/i.test(p.json.nombre_sap || "")
      )?.json;
    }

    if (pDb) clienteFinal = "DELMONTE";
  } else if (origenGufresco && tieneLote3 && !esDelMonte) {
    pDb = activos.find(p =>
      String(p.json.cliente || "") === "GUFRESCO"
    )?.json;
    if (pDb) {
      clienteFinal = pDb.cliente.toUpperCase();
      const loteGufresco = extractValue(cleanedText, /Lote:?\s*(\d{3})(?!\d)/i);
      if (loteGufresco) {
        loteIA = loteGufresco;
      }
    }
  }
}
// Si el cliente identificado es GUFRESCO (por cliente-hint o heurística)
// y el lote sigue sin detectarse, aplicar regex 3-dig. Las etiquetas
// GUFRESCO solo llevan día juliano (3 dígitos), no el lote completo de 6+.
if ((clienteFinal === "GUFRESCO" || clienteFinal === "OPCIO GELATS SL") && loteIA === "No detectado") {
  const lote3 = extractValue(cleanedText, /Lote:?\s*(\d{3})(?!\d)/i);
  if (lote3) {
    loteIA = lote3;
  }
}

// Si el producto identificado es LIDL Chef Select TACOS (prefijo EAN 4335619)
// y el lote sigue sin detectarse, aplicar regex "1 XXX" (1 fijo + 3 dígitos
// julianos, 5 caracteres). El regex genérico de arriba pide mínimo 6 y no
// lo captura. Backup del workflow dedicado tacos-lidl.js.
if (pDb && String(pDb.ean || "").startsWith("4335619") && loteIA === "No detectado") {
  const loteTacosLidl = extractValue(cleanedText, /Lote:?\s*(\d\s?\d{3})(?!\d)/i);
  if (loteTacosLidl) {
    loteIA = loteTacosLidl;
  }
}


// === BARRERA SANITARIA: PRODUCTO esperado (padre) vs producto detectado (pDb) ===
// El padre envía datosApp.producto = nombre_sap del producto de la orden.
// Si el workflow ha identificado un producto distinto (bote equivocado dentro
// del mismo cliente), bloqueamos por riesgo sanitario de cross-verificación.
// Sin el campo (padre no lo envía) → no bloquea, comportamiento actual.
if (datosApp.producto && pDb && pDb.nombre_sap) {
  const normalizar = (s) => String(s || "").toUpperCase().replace(/\s+/g, ' ').trim();
  const productoEsperado = normalizar(datosApp.producto);
  const productoDetectado = normalizar(pDb.nombre_sap);

  if (productoEsperado !== productoDetectado) {
    return [{
      json: {
        bloqueo_ia: true,
        error_sanitario: true,
        mensaje_error: `BOTE EQUIVOCADO: la orden es "${datosApp.producto}" pero el bote leído es "${pDb.nombre_sap}". Verifica que sea el bote correcto.`,
        cliente: "REINTENTAR",
        debug_texto_ocr: cleanedText,
        producto_esperado: datosApp.producto,
        producto_detectado: pDb.nombre_sap,
        cliente_hint_orden: clienteHint
      }
    }];
  }
}


// === VALIDACIÓN P+X ===
const diasSemana = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const diaSemanaIndex = dReferencia.getDay();
const diaSemanaText = diasSemana[diaSemanaIndex];

let val = { p_x_leido: 0, p_x_min: 0, p_x_max: 0, alerta: false, mensaje: "" };

if (dReferencia && dCad) {
  const diffTime = dCad.getTime() - dReferencia.getTime();
  val.p_x_leido = Math.round(diffTime / (1000 * 60 * 60 * 24));
}

const eanNoLeidoConBd = pDb && pDb.ean && String(pDb.ean).trim() !== '' && eanOcrLimpio === "No detectado";

if (eanNoLeidoConBd) {
  val.alerta = true;
  val.mensaje = "EAN NO LEÍDO";
} else if (pDb) {
  if (clienteFinal === "Maskom") {
    val.p_x_min = 8;
    val.p_x_max = 8;
  } else {
    val.p_x_min = Number(pDb.p_x_min);
    val.p_x_max = Number(pDb.p_x_max);
  }

  const pxDentroDeRango = val.p_x_leido >= val.p_x_min && val.p_x_leido <= val.p_x_max;
  if (pxDentroDeRango) {
    val.alerta = false;
    val.mensaje = "OK";
  } else {
    val.alerta = true;
    val.mensaje = `P+${val.p_x_leido} (debe estar entre P+${val.p_x_min} y P+${val.p_x_max})`;
  }
} else {
  val.alerta = true;
  val.mensaje = "PRODUCTO NO IDENTIFICADO";
}

let precioKgFinal, pesoNetoFinal, importeFinal;

if (clienteFinal === "Maskom") {
  precioKgFinal = "N/A";
  pesoNetoFinal = "0.540";
  importeFinal = "N/A";
} else {
  precioKgFinal = precioExtraido;
  pesoNetoFinal = pesoExtraido;
  importeFinal = importeExtraido;
}

const eanDeBd = pDb && pDb.ean && String(pDb.ean).trim() !== ''
  ? String(pDb.ean).trim()
  : "No detectado";

return [{
  json: {
    debug_texto_ocr: cleanedText,
    debug_ean_ocr: eanOcrLimpio,
    debug_pdb_seleccionado: pDb ? {
      ean: pDb.ean,
      nombre_sap: pDb.nombre_sap,
      en_activo: pDb.en_activo
    } : null,
    accion: accion,
    cliente: pDb ? clienteFinal : "REINTENTAR",
    cliente_alias: pDb?.cliente_alias || null,
    producto_sin_ean: pDb ? (!pDb.ean || String(pDb.ean).trim() === '') : false,
    producto_db: pDb ? (pDb.nombre_sap || pDb.nombre_corto) : "No encontrado",
       etiqueta_de_caja: pDb?.etiqueta_de_caja === true,
    dun: pDb?.dun || null,
    origen: origenIA,
       ean: eanOcrLimpio,
    ean_bd: pDb?.ean || null,
    lote: loteIA,
    codigo_r: codigoRIA,
       fecha_envasado: dReferencia
      ? `${String(dReferencia.getDate()).padStart(2,'0')}/${String(dReferencia.getMonth()+1).padStart(2,'0')}/${dReferencia.getFullYear()}`
      : "N/A",
 fecha_caducidad: (() => {
  if (!fechaCadIA) return "N/A";
  const parts = fechaCadIA.split(/[./-]/).map(s => s.trim());
  let d, m, y;
  if (parts.length === 2) {
    // Etiqueta sin año (DD/MM): asumimos año actual, o el siguiente si la fecha ya pasó
    d = String(parseInt(parts[0], 10)).padStart(2, '0');
    m = String(parseInt(parts[1], 10)).padStart(2, '0');
    const hoy = new Date();
    const candidato = new Date(hoy.getFullYear(), parseInt(m, 10) - 1, parseInt(d, 10));
    y = String(candidato < hoy ? hoy.getFullYear() + 1 : hoy.getFullYear());
  } else if (parts.length === 3) {
    d = String(parseInt(parts[0], 10)).padStart(2, '0');
    m = String(parseInt(parts[1], 10)).padStart(2, '0');
    y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
  } else {
    return "N/A";
  }
  return `${d}/${m}/${y}`;
})(),

    precio_kg: precioKgFinal + (precioKgFinal !== "N/A" ? " €/Kg" : ""),
    peso_neto: pesoNetoFinal + (pesoNetoFinal !== "N/A" ? " Kg" : ""),
    importe: importeFinal + (importeFinal !== "N/A" ? " €" : ""),
    px_marcado_usuario: pxMarcadoPorUsuario,
    validacion_px: {
      px_leido: val.p_x_leido,
      px_min: val.p_x_min,
      px_max: val.p_x_max,
      dia_semana_nombre: diaSemanaText,
      resultado: val.mensaje
    },
    error_sanitario: val.alerta,
    bloqueo_ia: !pDb,
    mensaje_bloqueo_ean: !pDb ? "No se ha podido identificar el producto en la etiqueta. Verifica que la foto sea nítida y vuelve a intentarlo." : null,
    fecha_informe: ahora.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  }
}];
