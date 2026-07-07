/**
 * NODO: Code JavaScript - ANALISIS DE ETIQUETA FRONTAL Del Monte Tacos
 * Versión: 3 - + peso_neto, + fecha con año, + validacion_px, + lookup BD para px_esperado
 * ultima_actualizacion: 2026-06-17
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 *
 * Solo extrae: producto, peso, fecha caducidad, lote, P+X.
 * Hace lookup en BD (via nodo "Get productos tacos") para el px_esperado
 * según cliente + día de la semana. La identificación del cliente/producto
 * viene de la fase tarrina previa, no de este workflow.
 */

let iaFalloTotalmente = false;
let mensajeDetalladoIA = "";
let openaiOutput;

const datosApp = $('Webhook').item.json.body || {};
const fechaProduccionApp = datosApp.fecha_produccion || null;

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
  mensajeDetalladoIA = "Error crítico de conexión entre nodos.";
}

if (iaFalloTotalmente) {
  return [{
    json: {
      bloqueo_ia: true,
      mensaje_error: mensajeDetalladoIA,
      cliente: "REINTENTAR"
    }
  }];
}

const fullText = openaiOutput?.content?.[0]?.text
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

function extractValue(text, regex, group = 1) {
  const match = text.match(regex);
  return match ? match[group].trim() : null;
}

// === Producto ("Piña troceada 400g" o variantes) ===
const producto = extractValue(cleanedText, /Producto["\s:]*([^"]*pi[ñn]a\s*troceada\s*\d+\s*g)/i)
              || extractValue(cleanedText, /(pi[ñn]a\s*troceada\s*\d+\s*g)/i)
              || extractValue(cleanedText, /(pi[ñn]a\s*troceada)/i)
              || "No detectado";

// === Peso neto: extraído del gramaje del producto (e.g. "400g" → "0.400 Kg") ===
let pesoNeto = "0.000 Kg";
const gramajeMatch = (producto + ' ' + cleanedText).match(/(\d{2,4})\s*g\b/i);
if (gramajeMatch) {
  const gr = parseInt(gramajeMatch[1], 10);
  if (gr > 0 && gr < 5000) pesoNeto = (gr / 1000).toFixed(3) + ' Kg';
}

// === Fecha caducidad: 29/05 o 29/05/26 — normalizamos a DD/MM/YYYY ===
const fechaCaducidadRaw = extractValue(cleanedText, /caducidad["\s:]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i)
                       || "No detectado";

function normalizarFechaCaducidad(raw) {
  if (!raw || raw === "No detectado") return "No detectado";
  const parts = raw.split('/').map(s => s.trim());
  if (parts.length < 2 || parts.length > 3) return raw;
  const d = String(parseInt(parts[0], 10)).padStart(2, '0');
  const m = String(parseInt(parts[1], 10)).padStart(2, '0');
  let y;
  if (parts.length === 3) {
    y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
  } else {
    // Sin año en la etiqueta: asumimos año actual, o el siguiente si la fecha ya pasó
    const hoy = new Date();
    const candidato = new Date(hoy.getFullYear(), parseInt(m, 10) - 1, parseInt(d, 10));
    y = String(candidato < hoy ? hoy.getFullYear() + 1 : hoy.getFullYear());
  }
  return `${d}/${m}/${y}`;
}

const fechaCaducidad = normalizarFechaCaducidad(fechaCaducidadRaw);

// === Lote ===
const loteMatch = cleanedText.match(/lote["\s:]*(\d{1,2})\s+(\d{3})\b/i);
const lote = loteMatch ? `${loteMatch[1]} ${loteMatch[2]}` : "No detectado";
const lineaProduccion = loteMatch ? Number(loteMatch[1]) : null;
const diaJulianoLote = loteMatch ? Number(loteMatch[2]) : null;

// === Validación P+X (caducidad − fecha_produccion + lookup BD) ===
function parseDDMMYYYY(s) {
  if (!s || s === "No detectado") return null;
  const p = s.split('/').map(x => parseInt(x.trim(), 10));
  if (p.length !== 3 || p.some(isNaN)) return null;
  return new Date(p[2], p[1] - 1, p[0]);
}
function parseISO(s) {
  if (!s) return null;
  const p = s.split('-').map(x => parseInt(x, 10));
  if (p.length !== 3 || p.some(isNaN)) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}

let validacion_px = { px_leido: 0, px_esperado: 0, dia_semana_nombre: '', resultado: 'No calculado' };
const diasSemana = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];

// Lookup BD: producto TACOS activo del cliente. Si hay varios (240g, 400g…)
// elegimos el que case con el gramaje leído de la etiqueta (peso_neto OCR).
let productoTacos = null;
try {
  const productosTacos = $('Get productos tacos').all().map(it => it.json);
  if (productosTacos.length === 1) {
    productoTacos = productosTacos[0];
  } else if (productosTacos.length > 1) {
    const gr = Math.round(parseFloat(pesoNeto) * 1000); // "0.400 Kg" → 400
    productoTacos = productosTacos.find(p =>
      (gr && Number(p.gramaje_peso_fijo) === gr) ||
      (gr && String(p.nombre_sap || '').includes(String(gr)))
    ) || productosTacos[0];
  }
} catch (e) { /* sin nodo o sin BD → seguimos sin lookup */ }

const dCad = parseDDMMYYYY(fechaCaducidad);
const dProd = parseISO(fechaProduccionApp);
if (dCad && dProd) {
  const diffDias = Math.round((dCad.getTime() - dProd.getTime()) / 86400000);
  validacion_px.px_leido = diffDias;
  const diaSemana = dProd.getDay(); // 0=DOM, 1=LUN, 2=MAR, 3=MIÉ, 4=JUE, 5=VIE, 6=SÁB
  validacion_px.dia_semana_nombre = diasSemana[diaSemana];

  if (productoTacos) {
    // p_x_d_l_m_x cubre L/M/X/S, p_x_j para jueves, p_x_v para viernes
    if (diaSemana === 4) {
      validacion_px.px_esperado = Number(productoTacos.p_x_j) || 0;
    } else if (diaSemana === 5) {
      validacion_px.px_esperado = Number(productoTacos.p_x_v) || Number(productoTacos.p_x_d_l_m_x) || 0;
    } else {
      validacion_px.px_esperado = Number(productoTacos.p_x_d_l_m_x) || 0;
    }

    if (validacion_px.px_leido === validacion_px.px_esperado) {
      validacion_px.resultado = 'OK';
    } else {
      validacion_px.resultado = `KO (esperado ${validacion_px.px_esperado}, leído ${validacion_px.px_leido})`;
    }
  } else {
    validacion_px.resultado = 'OK (sin lookup BD)';
  }
}

return [{
  json: {
    debug_texto_ocr: cleanedText,
    producto: producto,
    peso_neto: pesoNeto,
    fecha_caducidad: fechaCaducidad,
    lote: lote,
    linea_produccion: lineaProduccion,
    dia_juliano_lote: diaJulianoLote,
    validacion_px: validacion_px,
    bloqueo_ia: false,
    fecha_informe: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  }
}];
