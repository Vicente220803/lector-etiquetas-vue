/**
 * NODO: Code JavaScript - n8n PIÑA
 * Versión: 7.6 - EAN ilegible en foto ya no bloquea si hay clienteHint (orden)
 * ultima_actualizacion: 2026-07-24
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 *
 * v7.6 — Motivo: defecto físico de impresión (cabezal, raya en el código de
 *   barras) puede dejar el EAN ilegible en foto aunque el producto esté
 *   correctamente identificado por la orden (clienteHint). Antes esto
 *   bloqueaba siempre con "EAN NO LEÍDO" — repetir la foto no arregla un
 *   defecto de impresión. Ahora: si hay clienteHint, no bloquea, solo avisa
 *   (ean_no_legible_advertencia) y el escaneo físico con la pistola
 *   confirma el EAN real contra ean_esperado_completo. Sin clienteHint
 *   (auto-mode) se mantiene el bloqueo original. Mismo patrón ya validado
 *   hoy en tacos-lidl.js.
 *
 * v7.5 — BUG CONFIRMADO en producción (test n8n directo): al buscar por
 *   clienteHint=LIDL sin `fase`, el filtro `esTacosSku` solo miraba si
 *   nombre_sap contenía la palabra "TACOS". "MIX PI-MEL-UVA 06X230 LIDL GR
 *   CHEFSELECT" NO contiene esa palabra, así que caía en el mismo grupo que
 *   "PIÑA CILINDRO 06X540 LIDL VD CHEF SELECT" y `.find()` podía devolver
 *   el Mix en vez del Cilindro (orden no determinista de Supabase). La
 *   barrera BOTE EQUIVOCADO lo detectó y bloqueó correctamente, pero el
 *   origen del problema estaba en la identificación, no en la barrera.
 *   Fix: excluir SIEMPRE el grupo LIDL Chef Select TACOS (prefijo EAN
 *   4335619 — piña/coco/melón/sandía/mix) de esta búsqueda, ya que tiene
 *   su propio workflow productivo dedicado (tacos-lidl.js) y no debe
 *   competir aquí bajo ningún caso.
 *
 * v7.4 — P+X ya no depende del día de la semana. Se valida como rango
 *   tolerado [p_x_min, p_x_max] leído directamente del producto en BD.
 *   Las columnas viejas (p_x_d_l_m_x, p_x_j, p_x_v) siguen en BD pero
 *   el código ya no las lee. Caso especial "Maskom" (nombre sin acentuar,
 *   posible desajuste con BD) mantiene su rango fijo 8-8 hardcoded.
 *
 * v7.3 - Bloqueo ANTICH sin lote legible + Barrera EAN-cliente + Desambiguación Chef Select + Barrera producto
 */

let iaFalloTotalmente = false;
let mensajeDetalladoIA = "";
let openaiOutput;

const datosApp = $('Webhook').item.json.body;
const pxMarcadoPorUsuario = datosApp.px_usuario || "No indicado";
const accion = datosApp.accion || "analizar";
// Fase específica para DELMONTE TACOS (multi-foto): tarrina / film / caja
// Si no llega → flujo normal (1 sola foto)
const fase = datosApp.fase || null;
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

function calcularDigitoControlEAN13(doceDigitos) {
  if (doceDigitos.length !== 12 || !/^\d{12}$/.test(doceDigitos)) return null;
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(doceDigitos[i], 10);
    const peso = (i % 2 === 0) ? 1 : 3;
    suma += d * peso;
  }
  return (10 - (suma % 10)) % 10;
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
                         extractValue(cleanedText, /IMPORTE[:\s]*(\d+[,.]\d{2})/i) ||
                         extractValue(cleanedText, /PVP[:\s]*(\d+[,.]\d{2})\s*€?/i) || "0.00";

// === RED DE SEGURIDAD PESO ===
const precioNumSeg = parseFloat(String(precioExtraido).replace(',', '.'));
const importeNumSeg = parseFloat(String(importeExtraido).replace(',', '.'));
const pesoNumSeg = parseFloat(String(pesoExtraido).replace(',', '.'));
if (precioNumSeg > 0 && importeNumSeg > 0 && pesoNumSeg > 0) {
  const pesoCalculado = importeNumSeg / precioNumSeg;
  const margenRel = Math.abs(pesoCalculado - pesoNumSeg) / pesoCalculado;
  if (margenRel > 0.05) {
    pesoExtraido = pesoCalculado.toFixed(3);
  }
}

const origenIA = extractValue(cleanedText, /ORIGEN:?\s*([^:;0-9\[]+?)(?=\s*(?:ELABORADO|LOTE|LOT|FECHA|PESO|PRECIO|BARCODE|\[|$))/i) || "Costa Rica";

let loteIA = extractValue(cleanedText, /(?:Lote|Llot|Lot):?\s*([\d\s]{6,20})/i) || "No detectado";

if (loteIA !== "No detectado") {
  const partes = loteIA.trim().split(/\s+/);
  if (partes.length >= 2 && new RegExp(`\\b${partes[partes.length - 1]}\\s*g\\b`, 'i').test(cleanedText)) {
    partes.pop();
    loteIA = partes.join(' ');
  }
}

const codigoRIA = extractValue(cleanedText, /(R[-\s]?\d{1,2})/i, 0) || "N/A";

// === EAN ===
const prefijosValidos = [...new Set(
  productosDB
    .map(p => String(p.json.ean || ""))
    .filter(e => e.length >= 7)
    .map(e => e.substring(0, 7))
)];

let eanLimpio = "No detectado";

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

eanLimpio = buscarEan(cleanedText, 13) || buscarEan(cleanedText, 8) || "No detectado";

// === RED DE SEGURIDAD EAN ===
if (eanLimpio === "No detectado") {
  const textoSinEspacios = (fullText || cleanedText || "").replace(/\s+/g, "");
  const matchEan = textoSinEspacios.match(/(8\d{12})/) || textoSinEspacios.match(/(2\d{12})/);
  if (matchEan) eanLimpio = matchEan[1];
}

if (eanLimpio === "No detectado") {
  const textoOcrSinEsp = (fullText || cleanedText || "").replace(/\s+/g, "");
  const match12 = textoOcrSinEsp.match(/(?<![0-9])([0-9]{12})(?![0-9])/);
  if (match12) {
    const candidato12 = match12[1];
    const esActivoTmp = (v) => v === true || String(v).toUpperCase() === "TRUE" || v === 1 || v === "1";
    for (const prefijo of ['2', '8', '0', '1', '3', '4', '5', '6', '7', '9']) {
      const candidato13 = prefijo + candidato12;
      const matchBD = productosDB.find(p =>
        String(p.json.ean || "") === candidato13 && esActivoTmp(p.json.en_activo)
      );
      if (matchBD) {
        eanLimpio = candidato13;
        break;
      }
    }
    if (eanLimpio === "No detectado") {
      for (const prefijo of ['2', '8', '0', '1', '3', '4', '5', '6', '7', '9']) {
        const candidato13 = prefijo + candidato12;
        const matchBD = productosDB.find(p =>
          String(p.json.ean || "").substring(0, 7) === candidato13.substring(0, 7) &&
          esActivoTmp(p.json.en_activo)
        );
        if (matchBD) {
          eanLimpio = candidato13;
          break;
        }
      }
    }
  }
}

const fechaEnvasadaIA = extractValue(cleanedText, /Fecha[:\s]*(?:de[:\s]*)?[Ee]nvasad[ao][:\s]*(\d{2}[./-]\d{2}[./-]\d{2,4})/i);
const fechaEnvIA = extractValue(cleanedText, /Fecha Env[:\s]*(\d{2}[./-]\d{2}[./-]\d{2,4})/i);
const fechaCadIA = extractValue(cleanedText, /(?:Fecha Cad|caducidad|caducitat)[:\s]*(\d{2}[./-]\d{2}[./-]\d{2,4})/i)
                || extractValue(cleanedText, /(?:Fecha Cad|caducidad|caducitat)[:\s]*(\d{2}[./-]\d{2})/i);

// === CLIENTE ===
const esActivoTemp = (v) => v === true || String(v).toUpperCase() === "TRUE" || v === 1 || v === "1";
let pDbTemp;
if (eanLimpio !== "No detectado") {
  pDbTemp = productosDB.find(p =>
    String(p.json.ean || "") === eanLimpio &&
    esActivoTemp(p.json.en_activo)
  )?.json;
  if (!pDbTemp && eanLimpio.length >= 7) {
    pDbTemp = productosDB.find(p =>
      String(p.json.ean || "").substring(0, 7) === eanLimpio.substring(0, 7) &&
      esActivoTemp(p.json.en_activo)
    )?.json;
  }
}

let clienteFinal = (pDbTemp && pDbTemp.cliente) ? pDbTemp.cliente.toUpperCase() : "OTROS";

// === BARRERA SANITARIA: EAN del bote vs cliente-hint de la orden ===
// Si el EAN leído pertenece a otro cliente distinto al que el padre dice que
// es la orden, el operario ha escaneado un bote equivocado. Bloqueamos.
// Comparación FLEXIBLE (uno contiene al otro) para que cuadren variantes
// como "LIDL" en BD vs "LIDL SUPERMERCADOS, S.A.U" en orden, o
// "CASA AMETLLER" vs "CASA AMETLLER, S.L".
if (clienteHint && pDbTemp && pDbTemp.cliente && eanLimpio !== "No detectado" && fase !== 'tarrina') {
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
        mensaje_error: `BOTE EQUIVOCADO: el EAN ${eanLimpio} pertenece a ${pDbTemp.cliente}, pero la orden es de ${clienteHint}. Verifica que el bote sea correcto.`,
        cliente: "REINTENTAR",
        debug_texto_ocr: cleanedText,
        ean: eanLimpio,
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
//    Disambiguación DELMONTE: si llega `fase` → TACOS; sin fase → cilindro/rodajas
//    LIDL Chef Select TACOS (prefijo EAN 4335619: piña/melón/sandía/mix/coco)
//    tiene workflow productivo PROPIO (tacos-lidl.js) — se excluye siempre de
//    aquí para que nunca compita con PIÑA CILINDRO ni con el flujo `fase` de
//    DELMONTE. Sin esta exclusión, "MIX ... CHEFSELECT" (sin la palabra
//    "TACOS" en el nombre) caía en el mismo grupo que PIÑA CILINDRO y podía
//    ser elegido por error al buscar por clienteHint=LIDL.
if (clienteHint) {
  const esTacosFlow = fase !== null;
  pDb = activos.find(p => {
    const matchCliente = String(p.json.cliente || "").toUpperCase() === clienteHint;
    const matchAlias = String(p.json.cliente_alias || "").toUpperCase() === clienteHint;
    if (!matchCliente && !matchAlias) return false;
    if (!esActivo(p.json.en_activo)) return false;
    const esLidlChefSelectTacosGroup = String(p.json.ean || "").startsWith("4335619");
    if (esLidlChefSelectTacosGroup) return false;
    const esTacosSku = /TACOS/i.test(String(p.json.nombre_sap || ""));
    return esTacosFlow ? esTacosSku : !esTacosSku;
  })?.json;
  if (pDb) clienteFinal = pDb.cliente.toUpperCase();
}

// Desambiguación DENTRO del cliente cuando hay varios SKUs activos con el mismo
// prefijo EAN (caso LIDL: PRP vs CHEF SELECT — comparten EAN base 229981000).
// Usamos el contenido de la etiqueta OCR ("chef select") para elegir el SKU
// correcto. Si no aparece la marca, se queda con el que ya se había elegido
// (típicamente el PRP genérico).
if (pDb && clienteHint) {
  const esTacosFlow = fase !== null;
  const candidatos = activos.filter(p => {
    const c = String(p.json.cliente || "").toUpperCase();
    const cA = String(p.json.cliente_alias || "").toUpperCase();
    const matchCli = c === clienteHint || cA === clienteHint;
    if (!matchCli) return false;
    if (String(p.json.ean || "").startsWith("4335619")) return false;
    const esTacosSku = /TACOS/i.test(String(p.json.nombre_sap || ""));
    return esTacosFlow ? esTacosSku : !esTacosSku;
  }).map(p => p.json);

  if (candidatos.length > 1) {
    const esChefSelect = /chef\s*select/i.test(cleanedText);
    const desambiguado = candidatos.find(p =>
      esChefSelect
        ? /CHEF\s*SELECT/i.test(String(p.nombre_sap || ""))
        : !/CHEF\s*SELECT/i.test(String(p.nombre_sap || ""))
    );
    if (desambiguado) {
      pDb = desambiguado;
      clienteFinal = pDb.cliente.toUpperCase();
    }
  }
}

// 2. Fallback OCR: auto-mode o cliente no en BD → match exacto primero, luego prefijo 7
if (!pDb) {
  pDb = activos.find(p =>
    String(p.json.ean || "") === eanLimpio &&
    esActivo(p.json.en_activo)
  )?.json;
  if (!pDb && eanLimpio !== "No detectado" && eanLimpio.length >= 7) {
    pDb = activos.find(p =>
      String(p.json.ean || "").substring(0, 7) === eanLimpio.substring(0, 7) &&
      esActivo(p.json.en_activo)
    )?.json;
  }
}

// Fallback heurístico ALABAU
if (!pDb && clienteFinal === "OTROS") {
  const tienePinaRodajas = /PI[ÑN]A\s+RODAJAS/i.test(cleanedText);
  const tienePeso540 = /0[.,]540\s*Kg/i.test(cleanedText);
  if (tienePinaRodajas && tienePeso540) {
    pDb = activos.find(p =>
      String(p.json.cliente || "") === "ALABAU FRUTAS Y VERDURAS, S.L."
    )?.json;
    if (pDb) {
      clienteFinal = pDb.cliente.toUpperCase();
    }
  }
}

// Fallback heurístico ANTICH: lote 3 dígitos + sin EAN
if (!pDb && clienteFinal === "OTROS") {
  const tieneLote3 = /Lote:?\s*\d{3}(?!\d)/i.test(cleanedText);
  if (tieneLote3 && eanLimpio === "No detectado") {
    pDb = activos.find(p =>
      String(p.json.cliente || "") === "ANTICH SPANISH FOOD, S.L."
    )?.json;
    if (pDb) {
      clienteFinal = pDb.cliente.toUpperCase();
      const loteAntich = extractValue(cleanedText, /Lote:?\s*(\d{3})(?!\d)/i);
      if (loteAntich) loteIA = loteAntich;
    }
  }
}

// Bloqueo específico MERCADONA: el código R (R-XX) es obligatorio
// para trazabilidad. Si no se lee → STOP.
let mercadonaSinR = false;
if (clienteFinal === "MERCADONA SA" && (codigoRIA === "N/A" || !codigoRIA)) {
  mercadonaSinR = true;
}
// Si el producto tiene EAN en BD pero el OCR no lo leyó, bloquear.
// Antes del cliente-hint este caso se filtraba solo (al no encontrar pDb).
// Con cliente-hint pDb se identifica por nombre → necesitamos check explícito.
//
// EXCEPCIÓN (v7.6): si hay clienteHint (verify mode, la orden identifica el
// producto con autoridad), no bloqueamos por EAN ilegible en foto — puede
// ser un defecto de impresión (cabezal, raya en el código de barras) y no
// un problema del producto. En su lugar avisamos (ean_no_legible_advertencia)
// y dejamos que el escaneo físico con la pistola confirme el EAN real
// contra ean_esperado_completo. Mismo patrón ya validado en tacos-lidl.js.
let eanNoLeidoConBd = false;
if (pDb && pDb.ean && String(pDb.ean).trim() !== '' && eanLimpio === "No detectado" && fase !== 'tarrina') {
  eanNoLeidoConBd = true;
}
const eanNoLeidoBloquea = eanNoLeidoConBd && !clienteHint;

// === EAN ESPERADO COMPLETO PARA MERCADONA (peso variable / importe) ===
// MERCADONA codifica el importe (en céntimos) dentro del EAN-13:
//   ean_bd (9 dig) + importe×100 (3 dig zero-padded) + check digit (1 dig) = 13 dig
// Si el importe no se lee o está fuera de rango → bloqueo "IMPORTE NO LEÍDO"
let eanEsperadoCompleto = null;
let mercadonaSinImporte = false;
let aldiSinPeso = false;

if (pDb && pDb.ean) {
  const eanBd = String(pDb.ean).trim();

    // MERCADONA / LIDL / CONSUM: 9 dig BD + 3 dig importe céntimos + check
      if ((clienteFinal === "MERCADONA SA" || clienteFinal === "LIDL SUPERMERCADOS, S.A.U" || clienteFinal === "CONSUM" || clienteFinal === "DELMONTE" || clienteFinal === "CASA AMETLLER, S.L") && eanBd.length === 9) {

    const importeNum = parseFloat(String(importeExtraido).replace(',', '.'));
    if (!importeNum || importeNum <= 0 || importeNum >= 10) {
      mercadonaSinImporte = true;
    } else {
      const importeCentimos = String(Math.round(importeNum * 100)).padStart(3, '0');
      const doceDigitos = eanBd + importeCentimos;
      const checkDigit = calcularDigitoControlEAN13(doceDigitos);
      if (checkDigit !== null) {
        eanEsperadoCompleto = doceDigitos + checkDigit;
      }
    }
  }

  // ALDI: 9 dig BD + 3 dig peso (gramos) + check
  if (clienteFinal === "ALDI" && eanBd.length === 9) {
    const pesoNum = parseFloat(String(pesoExtraido).replace(',', '.'));
    const pesoG = Math.round(pesoNum * 1000);
    if (!pesoG || pesoG <= 0 || pesoG >= 1000) {
      aldiSinPeso = true;
    } else {
      const pesoStr = String(pesoG).padStart(3, '0');
      const doceDigitos = eanBd + pesoStr;
      const checkDigit = calcularDigitoControlEAN13(doceDigitos);
      if (checkDigit !== null) {
        eanEsperadoCompleto = doceDigitos + checkDigit;
      }
    }
  }
}

// Bloqueo específico ANTICH: perfil ANTICH sin lote legible
let antichSinLote = false;
if (!pDb && clienteFinal === "OTROS" && loteIA === "No detectado") {
  const sinEan = eanLimpio === "No detectado";
  const tieneOrigenCostaRica = /ORIGEN:?\s*Costa\s*Rica/i.test(cleanedText);
  const tieneCaducidad = fechaCadIA !== null;
  const sinPesoNiPrecio = pesoExtraido === "0.000" && precioExtraido === "0.00";

  if (sinEan && tieneOrigenCostaRica && tieneCaducidad && sinPesoNiPrecio) {
    antichSinLote = true;
  }
}

// Fallback heurístico DEL MONTE TACOS
if (clienteFinal === "OTROS" && /del\s*monte/i.test(cleanedText)) {
  clienteFinal = "DELMONTE";
}


// === BARRERA SANITARIA: PRODUCTO esperado (padre) vs producto detectado (pDb) ===
// El padre envía datosApp.producto = nombre_sap del producto de la orden.
// Si el workflow ha identificado un producto distinto (bote equivocado dentro
// del mismo cliente: PRP vs Chef Select, DELMONTE cilindro vs TACOS, etc.),
// bloqueamos por riesgo sanitario de cross-verificación.
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


// === DÍA JULIANO ===
let diaJulianoLote = null;
if (loteIA && loteIA !== "No detectado") {
  const loteLimpio = loteIA.replace(/\s+/g, '');
  if (loteLimpio.length >= 6) {
    diaJulianoLote = loteLimpio.substring(3, 6);
  } else if (loteLimpio.length === 3) {
    diaJulianoLote = loteLimpio;
  }
}

const inicioAño = new Date(ahora.getFullYear(), 0, 0);
const diaJulianoHoy = String(Math.floor((ahora - inicioAño) / (1000 * 60 * 60 * 24))).padStart(3, '0');
const loteDiaCorrecto = diaJulianoLote === diaJulianoHoy;

const diasSemana = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const diaSemanaIndex = dReferencia.getDay();
const diaSemanaText = diasSemana[diaSemanaIndex];

let val = { p_x_leido: 0, p_x_min: 0, p_x_max: 0, alerta: false, mensaje: "" };

if (dReferencia && dCad) {
    const diffTime = dCad.getTime() - dReferencia.getTime();
    val.p_x_leido = Math.round(diffTime / (1000 * 60 * 60 * 24));
}

if (fase === 'tarrina') {
    // Fase 1 TACOS: la etiqueta tarrina solo tiene marca + EAN + origen.
    // No tiene fechas, lote, peso ni P+X. Solo identificamos el producto.
    if (pDb) {
        val.alerta = false;
        val.mensaje = "OK (etiqueta tarrina)";
    } else {
        val.alerta = true;
        val.mensaje = eanLimpio === "No detectado" ? "EAN NO LEÍDO" : "PRODUCTO NO ENCONTRADO";
    }
} else if (antichSinLote) {
    val.alerta = true;
    val.mensaje = "LOTE NO LEÍDO";
} else if (eanNoLeidoBloquea) {
    val.alerta = true;
    val.mensaje = "EAN NO LEÍDO";
} else if (mercadonaSinR) {
    val.alerta = true;
    val.mensaje = "CÓDIGO R NO LEÍDO";
} else if (mercadonaSinImporte) {
    val.alerta = true;
    val.mensaje = "IMPORTE NO LEÍDO";
} else if (aldiSinPeso) {
    val.alerta = true;
    val.mensaje = "PESO NO LEÍDO";
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
    val.mensaje = eanLimpio === "No detectado" ? "EAN NO LEÍDO" : "EAN NO EN BD";
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

return [{
  json: {
    debug_texto_ocr: cleanedText,
    debug_openai_keys: openaiOutput ? Object.keys(openaiOutput).join(',') : 'NULL',
    debug_pdb_seleccionado: pDb ? {
      ean: pDb.ean,
      nombre_sap: pDb.nombre_sap,
      en_activo: pDb.en_activo
    } : null,
    accion: accion,
    cliente: clienteFinal,
    cliente_alias: pDb?.cliente_alias || null,
    producto_sin_ean: pDb ? (!pDb.ean || String(pDb.ean).trim() === '') : false,
    producto_db: pDb ? (pDb.nombre_sap || pDb.nombre_corto) : "No encontrado",
       etiqueta_de_caja: pDb?.etiqueta_de_caja === true,
    dun: pDb?.dun || null,
    origen: origenIA,
        ean: eanLimpio,
    ean_bd: pDb?.ean || null,
    ean_esperado_completo: eanEsperadoCompleto || null,
    lote: loteIA,
    lote_dia_juliano: diaJulianoLote,
    dia_juliano_hoy: diaJulianoHoy,
    lote_dia_correcto: loteDiaCorrecto,
    // Solo MERCADONA lleva código R. Para el resto devolvemos vacío
// (la regex laxa puede pillar "R 71" espurios en lotes/otros textos).
codigo_r: clienteFinal === "MERCADONA SA" ? codigoRIA : "",
        fecha_envasado: dReferencia
      ? `${String(dReferencia.getDate()).padStart(2,'0')}/${String(dReferencia.getMonth()+1).padStart(2,'0')}/${dReferencia.getFullYear()}`
      : "N/A",
    fecha_caducidad: (() => {
      if (!fechaCadIA) return "N/A";
      const parts = fechaCadIA.split(/[./-]/);
      if (parts.length === 2) return "N/A";
      let [d, m, y] = parts.map(s => s.trim());
      if (y.length === 2) y = '20' + y;
      return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`;
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
    ean_no_legible_advertencia: eanNoLeidoConBd && !eanNoLeidoBloquea,
    bloqueo_ia: false,
    fecha_informe: ahora.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  }
}];
