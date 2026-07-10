/**
 * NODO: Code JavaScript - ANALISIS ETIQUETA CAJA (Capa 2)
 * Versión: 1.0
 * ultima_actualizacion: 2026-07-08
 *
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 *
 * PROPÓSITO: 2ª rama del workflow `analisis-etiqueta-alta`. Se activa por un
 * webhook independiente (URL `analisis-etiqueta-alta-CAJA`). Solo analiza la
 * foto de la CAJA para determinar si el workflow `caja` productivo ya la
 * reconoce por alguno de sus 7 patrones actuales.
 *
 * A diferencia del análisis de bote, esta rama NO necesita:
 *  - Get many rows (no busca colisiones de EAN — no aplican a caja).
 *  - Comparación campo por campo con producto_json (esa la hace el bote).
 *
 * Recibe (en $('webhook caja').item.json.body):
 *  - producto_json (string): JSON con los campos del producto (para poder
 *    mostrar contexto en la respuesta). No es crítico para la lógica.
 *
 * Recibe (en $('Analyze image caja').item.json): JSON estricto devuelto por
 * OpenAI Vision con las señas de la caja (código_proveedor, codigo_articulo,
 * dun_ean14, marca_texto_identificativo, producto_texto, formato, etc).
 * Ver prompt en docs/workflows/analisis-etiqueta-alta-prompt-CAJA.md.
 *
 * Devuelve JSON con:
 *  - senas_detectadas: lo que la IA extrajo de la etiqueta caja.
 *  - patrones_matched: array de patrones que reconoce (0, 1 o >1).
 *  - estado: SOPORTADO | NO_SOPORTADO | AMBIGUO.
 *  - recomendacion: mensaje accionable para el compa.
 */

// ============================================================
// 1. PARSING
// ============================================================

let iaFalloTotalmente = false;
let mensajeErrorIA = "";
let openaiOutput;

// Producto rellenado por el compa (contexto opcional)
const bodyDatos = $('webhook caja').item.json.body || {};
let productoRellenado = {};
try {
  productoRellenado = typeof bodyDatos.producto_json === 'string'
    ? JSON.parse(bodyDatos.producto_json)
    : (bodyDatos.producto_json || {});
} catch (e) {
  productoRellenado = {};
}

// Output de OpenAI (foto de caja analizada)
try {
  const inputIA = $('Analyze image caja').item;
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

let senasCaja;
try {
  senasCaja = JSON.parse(fullText);
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

// ============================================================
// 2. CROSS-CHECK contra los 7 patrones del workflow "caja"
// ============================================================
// Fuente de verdad: docs/workflows/caja.js
// Si aparece un patrón nuevo en el workflow caja, actualizar este array.

const PATRONES_CAJA_SOPORTADOS = [
  {
    cliente: "MERCADONA SA",
    descripcion: "Código de proveedor 948716",
    detecta: (s) => String(s.codigo_proveedor || "").trim() === "948716"
  },
  {
    cliente: "ALDI PIÑA",
    descripcion: "Código de artículo 6012873 o formato 07x540g",
    detecta: (s) =>
      String(s.codigo_articulo || "").trim() === "6012873" ||
      /07x540\s*g/i.test(String(s.formato || ""))
  },
  {
    cliente: "ALDI COCO",
    descripcion: "Código 9907 + Coco o formato 08x150g",
    detecta: (s) =>
      /08x150\s*g/i.test(String(s.formato || "")) ||
      (String(s.codigo_articulo || "").trim() === "9907" &&
       /COCO/i.test(String(s.producto_texto || "") + " " + String(s.marca_texto_identificativo || "")))
  },
  {
    cliente: "DELMONTE PIÑA",
    descripcion: "DUN 18721008388387 o formato 6x500g + Piña",
    detecta: (s) =>
      String(s.dun_ean14 || "").replace(/\s/g, "") === "18721008388387" ||
      (/6x500\s*g/i.test(String(s.formato || "")) &&
       /PI[ÑN]A/i.test(String(s.producto_texto || "")))
  },
  {
    cliente: "CONSUM PIÑA",
    descripcion: "DUN 3843701912201",
    detecta: (s) => String(s.dun_ean14 || "").replace(/\s/g, "") === "3843701912201"
  },
  {
    cliente: "DELMONTE COCO",
    descripcion: "Texto 'COCO DEL MONTE'",
    detecta: (s) =>
      /COCO\s+DEL\s+MONTE/i.test(
        String(s.marca_texto_identificativo || "") + " " + String(s.producto_texto || "")
      )
  },
  {
    cliente: "DELMONTE PIÑA TROCEADA",
    descripcion: "Texto 'PIÑA TROCEADA'",
    detecta: (s) => /PI[ÑN]A\s+TROCEADA/i.test(String(s.producto_texto || ""))
  }
];

const matches = PATRONES_CAJA_SOPORTADOS.filter(p => {
  try { return p.detecta(senasCaja); }
  catch (e) { return false; }
});

// ============================================================
// 3. CLASIFICACIÓN Y RECOMENDACIÓN
// ============================================================

let estado, clasificacion, recomendacion;

if (matches.length === 1) {
  estado = "SOPORTADO";
  clasificacion = "ESTANDAR";
  recomendacion =
    `Workflow caja YA reconoce esta caja por patrón: "${matches[0].descripcion}" ` +
    `(cliente ${matches[0].cliente}). Solo asegúrate de rellenar el campo 'dun' en BD ` +
    `si aparece un DUN de 14 dígitos en la etiqueta. Puedes activar el producto.`;
} else if (matches.length === 0) {
  estado = "NO_SOPORTADO";
  clasificacion = "EXCEPCION";
  const senasResumen = [
    senasCaja.codigo_proveedor ? `código_proveedor="${senasCaja.codigo_proveedor}"` : null,
    senasCaja.codigo_articulo ? `código_artículo="${senasCaja.codigo_articulo}"` : null,
    senasCaja.dun_ean14 ? `DUN="${senasCaja.dun_ean14}"` : null,
    senasCaja.marca_texto_identificativo ? `marca="${senasCaja.marca_texto_identificativo}"` : null,
    senasCaja.formato ? `formato="${senasCaja.formato}"` : null,
    senasCaja.producto_texto ? `producto="${senasCaja.producto_texto}"` : null
  ].filter(Boolean).join(", ");
  recomendacion =
    `Workflow caja NO reconoce esta caja. Detectado: ${senasResumen || 'nada identificable'}. ` +
    `Requiere añadir una nueva rama al Code node del workflow 'caja' en n8n (el que verifica ` +
    `cajas en producción). Estructura tipo: else if (/PATRON/.test(cleanedText)) { cliente = "..."; ... }. ` +
    `Copia este informe y ábrelo con Claude Code para que te sugiera el snippet exacto.`;
} else {
  estado = "AMBIGUO";
  clasificacion = "EXCEPCION";
  recomendacion =
    `Ambiguo — la caja podría ser ${matches.map(m => m.cliente).join(" o ")}. ` +
    `Requiere desambiguar en el workflow caja añadiendo alguna seña adicional.`;
}

// ============================================================
// 4. RESPUESTA
// ============================================================

return [{
  json: {
    tipo_analisis: "CAJA",
    senas_detectadas: senasCaja,
    patrones_matched: matches.map(m => ({ cliente: m.cliente, descripcion: m.descripcion })),
    estado: estado,
    clasificacion: clasificacion,
    recomendacion_activacion: recomendacion,
    producto_analizado: {
      id: productoRellenado.id || null,
      cliente: productoRellenado.cliente || null,
      nombre_sap: productoRellenado.nombre_sap || null
    },
    fecha_informe: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  }
}];
