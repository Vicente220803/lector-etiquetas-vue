/**
 * NODO: Code JavaScript - ANALISIS ETIQUETA CAJA
 * Versión: 6 - Regex código R laxa para MERCADONA (em-dash, dos puntos, etc.)
 * ultima_actualizacion: 2026-06-16
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 *
 * PROPÓSITO: Analiza la etiqueta EXTERIOR de la caja de embalaje (para
 * clientes con `etiqueta_de_caja=true` en BD). Identifica el cliente por
 * señas específicas de la caja (código proveedor, DUN, EAN de caja, texto
 * del producto) y extrae datos de trazabilidad de esa caja.
 *
 * A diferencia de los workflows piña/coco (que analizan bote), aquí NO
 * hay barrera EAN-cliente ni barrera producto: la validación cruzada la
 * hace el lector (App.vue procesarRespuestaCaja) comparando los datos de
 * la caja con los del bote previamente escaneado.
 */

let iaFalloTotalmente = false;
let mensajeDetalladoIA = "";
let openaiOutput;

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
      mensaje_error: mensajeDetalladoIA,
      cliente: "REINTENTAR",
      fecha_caducidad: null
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

// === DETECCIÓN DE CLIENTE Y EXTRACCIÓN ESPECÍFICA ===
let cliente = "OTROS";
let datos_extraidos = {};

// --- MERCADONA SA: identificado por código de proveedor 948716 ---
if (/(?:C[óo]digo\s+de\s+proveedor)[:\s]*948716/i.test(cleanedText)) {
  cliente = "MERCADONA SA";
  datos_extraidos = {
    proveedor: extractValue(cleanedText, /([A-Za-zñÑ][A-Za-zñÑ\s,\.]+?)\s+C[óo]digo\s+de\s+proveedor/i),
    codigo_proveedor: extractValue(cleanedText, /(?:C[óo]digo\s+de\s+proveedor)[:\s]*(\d+)/i),
    producto: extractValue(cleanedText, /proveedor[:\s]*\d+\s+([A-ZÑ\s]+?)\s+C[óo]digo\s+de\s+art[íi]culo/i),
    codigo_articulo: extractValue(cleanedText, /(?:C[óo]digo\s+de\s+art[íi]culo)[:\s]*(\d+)/i),
    fecha_envasado: extractValue(cleanedText, /Fecha\s+env[\.:\s]+(\d{2}[./-]\d{2}[./-]\d{2,4})/i),
    codigo_r: (() => {
      const m = cleanedText.match(/\bR[\s\-—_.:·,]*(\d{1,3})\b/i);
      return m ? `R-${m[1]}` : null;
    })(),
    fecha_caducidad: extractValue(cleanedText, /Fecha\s+cad[\.:\s]+(\d{2}[./-]\d{2}[./-]\d{2,4})/i)
  };
}
// --- ALDI PIÑA: identificado por código 6012873 o formato 07x540g ---
else if (/\b6012873\b/.test(cleanedText) || /\b07x540g\b/i.test(cleanedText)) {
  cliente = "ALDI";
  datos_extraidos = {
    codigo_articulo: "6012873",
    producto: extractValue(cleanedText, /6012873[\s\S]*?(Pi[ñn]a[^\n]*?)\s+\d{2}x\d{3,4}\s*g/i) || "Piña entera pelada (rodajas)",
    formato: extractValue(cleanedText, /(\d{2}x\d{3,4}\s*g)/i) || "07x540g"
  };
}
// --- ALDI COCO: identificado por código 9907+Coco o formato 08x150g ---
else if (/\b9907\b[\s\S]{0,20}Coco/i.test(cleanedText) || /\b08x150g\b/i.test(cleanedText)) {
  cliente = "ALDI";
  datos_extraidos = {
    codigo_articulo: "9907",
    producto: extractValue(cleanedText, /9907[\s\S]*?(Coco[^\n]*?)\s+\d{2}x\d{3,4}\s*g/i) || "Coco troceado",
    formato: extractValue(cleanedText, /(\d{2}x\d{3,4}\s*g)/i) || "08x150g"
  };
}
// --- DELMONTE PIÑA: identificado por EAN 18721008388387 o formato 6x500g + Piña ---
else if (
  cleanedText.replace(/\s/g, '').includes('18721008388387') ||
  /\b6x500\s*g\b/i.test(cleanedText) && /Pi[ñn]a/i.test(cleanedText)
) {
  cliente = "DELMONTE";
  datos_extraidos = {
    ean: "18721008388387",
    producto: extractValue(cleanedText, /(Pi[ñn]a[^0-9\n]*?)\s+\d+x\d{3,4}\s*g/i) || "Piña rodajas",
    formato: extractValue(cleanedText, /(\d+x\d{3,4}\s*g)/i) || "6x500g"
  };
}
// --- CONSUM PIÑA: identificado por DUN 3843701912201 ---
else if (cleanedText.replace(/\s/g, '').includes('3843701912201')) {
  cliente = "CONSUM";
  datos_extraidos = {
    producto: extractValue(cleanedText, /(PI[ÑN]A\s+RODAJAS)/i) || "PIÑA RODAJAS",
    unidades: extractValue(cleanedText, /(\d+\s+UNIDADES)/i),
    lote: extractValue(cleanedText, /Lote[:\s]+(\d{3}\s*\d{3})/i),
    ean: extractValue(cleanedText, /\(01\)\s*([\d\s]+?)\s+(?:Origen|Fecha)/i),
    origen: extractValue(cleanedText, /Origen[:\s]+([A-Za-zñÑ\s]+?)\s+Fecha/i),
    fecha_caducidad: extractValue(cleanedText, /Fecha\s+de\s+caducidad[:\s]+(\d{2}[./-]\d{2}[./-]\d{2,4})/i)
  };
}
// --- DELMONTE COCO: identificado por "COCO DEL MONTE" ---
else if (/COCO\s+DEL\s+MONTE/i.test(cleanedText)) {
  cliente = "DELMONTE";
  datos_extraidos = {
    producto: extractValue(cleanedText, /(COCO\s+DEL\s+MONTE\s+TROCEADO\s+\d{2,3}\s*g)/i),
    unidades: extractValue(cleanedText, /(\d+\s+UNIDADES)/i),
    lote: extractValue(cleanedText, /Lote[:\s]+(\d{3}\s*\d{3})/i),
    ean: extractValue(cleanedText, /\(01\)\s*([\d\s]+?)\s+(?:Origen|Fecha)/i),
    origen: extractValue(cleanedText, /Origen[:\s]+([A-Za-zñÑ\s]+?)\s+Fecha/i),
    fecha_caducidad: extractValue(cleanedText, /Fecha\s+de\s+caducidad[:\s]+(\d{2}[./-]\d{2}[./-]\d{2,4})/i)
  };
}
// --- DELMONTE PIÑA TROCEADA (tacos) ---
else if (/PI[ÑN]A\s+TROCEADA/i.test(cleanedText)) {
  cliente = "DELMONTE";
  datos_extraidos = {
    producto: extractValue(cleanedText, /(PI[ÑN]A\s+TROCEADA\s+\d+\s*g)/i),
    unidades: extractValue(cleanedText, /(\d+\s+UNIDADES)/i),
    lote: extractValue(cleanedText, /Lote[:\s]+(\d{2,4}(?:\s+\d{2,4})?)/i),
    ean: extractValue(cleanedText, /\(01\)\s+([\d\s]+?)\s+(?:Origen|Fecha)/i),
    origen: extractValue(cleanedText, /Origen[:\s]+([A-Za-zñÑ\s]+?)\s+Fecha/i),
    fecha_caducidad: extractValue(cleanedText, /Fecha\s+de\s+caducidad[:\s]+(\d{2}[./-]\d{2}[./-]\d{2,4})/i)
  };
}

return [{
  json: {
    debug_texto_ocr: cleanedText,
    cliente: cliente,
    fecha_caducidad: datos_extraidos.fecha_caducidad || "No detectado",
    datos_extraidos: datos_extraidos,
    bloqueo_ia: false
  }
}];
