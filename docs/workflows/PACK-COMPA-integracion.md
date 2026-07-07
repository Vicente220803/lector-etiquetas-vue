# Pack de integración — Análisis IA de etiquetas para alta de clientes

Documento para el equipo de cmi-operaciones. Especifica cómo integrar la funcionalidad "Analizar etiqueta con IA" en el Maestro de Productos.

Última actualización: 2026-07-06.

---

## 1. Resumen ejecutivo

Se ha creado un workflow n8n dedicado (`analisis-etiqueta-alta`) que:

- **Recibe**: foto de la etiqueta + los campos del producto que ya rellenó el usuario en Maestros.
- **Analiza** la etiqueta con OpenAI Vision (gpt-4o-mini, el mismo modelo ya en uso, coste despreciable).
- **Compara** lo detectado en la foto con los campos rellenados.
- **Chequea** colisiones de prefijo EAN con otros productos activos en BD.
- **Clasifica** el producto como:
  - `ESTANDAR`: puede activarse sin más — los workflows piña/coco lo procesarán bien tal cual.
  - `EXCEPCION`: requiere modificar el code de los workflows n8n antes de activar (típicamente por idioma nuevo, sin EAN, prefijo colisiona, etc.).
- **Devuelve** un JSON estructurado con toda la info del análisis + recomendación.

La integración desde el lado del compa consiste en:
1. Botón "Analizar etiqueta con IA" en la pantalla de Maestros → Productos (al lado del "Lanzar a producción").
2. Modal con upload de foto y muestra del informe.
3. Un pequeño endpoint en el backend que reenvía al webhook n8n.

---

## 2. Endpoint del webhook n8n

**URL producción**:
```
POST https://surexportlevante.app.n8n.cloud/webhook/analisis-etiqueta-alta
```

**URL test** (mientras se desarrolla — solo funciona con "Execute workflow" activo en n8n):
```
POST https://surexportlevante.app.n8n.cloud/webhook-test/analisis-etiqueta-alta
```

**Content-Type**: `multipart/form-data`

**Auth**: ninguna (el webhook está protegido por la URL única de n8n, mismo modelo que los otros webhooks del sistema).

---

## 3. Request

Multipart con dos campos:

### `file` (obligatorio)
- Tipo: binary (imagen).
- Formatos aceptados: JPEG, PNG.
- Tamaño recomendado: hasta 5 MB.
- Contenido: foto de la etiqueta del producto que se está dando de alta.

### `producto_json` (obligatorio)
- Tipo: string con JSON.
- Contenido: los campos del producto tal como están rellenados en la BD (después del formulario del compa).

Ejemplo del `producto_json`:
```json
{
  "id": 68,
  "cliente": "LIDL SUPERMERCADOS, S.A.U",
  "nombre_sap": "PIÑA CILINDRO 06X540 LIDL VD CHEF SELECT",
  "ean": "227634000",
  "tipo_codigo_ean": "Variable precio",
  "gramaje_peso_fijo": null,
  "p_x_d_l_m_x": 9,
  "p_x_j": 9,
  "p_x_v": 9,
  "etiqueta_de_caja": false,
  "dun": null,
  "cliente_alias": null
}
```

**Campos incluidos en `producto_json`**: id, cliente, nombre_sap, ean, tipo_codigo_ean, gramaje_peso_fijo, p_x_d_l_m_x, p_x_j, p_x_v, etiqueta_de_caja, dun, cliente_alias. No hace falta enviar los demás.

### Ejemplo de request desde JS (frontend o backend)

```javascript
async function analizarEtiqueta(archivoFoto, productoObj) {
  const formData = new FormData();
  formData.append('file', archivoFoto);
  formData.append('producto_json', JSON.stringify(productoObj));

  const res = await fetch(
    'https://surexportlevante.app.n8n.cloud/webhook/analisis-etiqueta-alta',
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    throw new Error(`Error del webhook: ${res.status}`);
  }

  return res.json();
}
```

---

## 4. Response

El webhook devuelve **un objeto plano** (no envuelto en array), tanto en éxito como en error controlado. Estructura de éxito:

```json
{
  "detectado_en_etiqueta": {
    "ean_completo": "2 276340 004505",
    "ean_prefijo_7dig": "2276340",
    "tipo_ean": "variable_precio_9_3_1",
    "peso_neto": "0.628 Kg",
    "precio_kg": "6.45 €/Kg",
    "importe": "4.05 €",
    "fecha_envasado_visible": false,
    "fecha_envasado": null,
    "fecha_caducidad": "14.07.26",
    "codigo_r_visible": false,
    "codigo_r": null,
    "lote_formato": "6 dígitos con separador",
    "lote_ejemplo": "002 187 0559 00",
    "idioma": "español",
    "marca_logo": "chef select",
    "origen": "Costa Rica",
    "producto_texto": "PIÑA RODAJAS"
  },
  "comparacion_con_campos_rellenados": [
    {
      "campo": "cliente",
      "valor_rellenado": "LIDL SUPERMERCADOS, S.A.U",
      "valor_detectado": "(no deducible por prefijo)",
      "estado": "OK (no verificable)"
    },
    {
      "campo": "ean_prefijo",
      "valor_rellenado": "2276340",
      "valor_detectado": "2276340",
      "estado": "OK"
    }
    // ... más campos
  ],
  "chequeo_colisiones_ean": {
    "prefijo_detectado": "2276340",
    "prefijo_colisiona": false,
    "otros_productos_mismo_prefijo": [],
    "colisiones_graves": []
  },
  "clasificacion": "ESTANDAR",
  "requiere_cambios_workflow": false,
  "workflow_destino": "pina",
  "es_tacos": false,
  "motivos_excepcion": [],
  "notas": [
    "Marca/logo detectada: \"chef select\". Si hay otro SKU del mismo cliente con marca distinta, puede requerir desambiguación como Chef Select/PRP.",
    "La etiqueta NO muestra fecha de envasado. El workflow usará la fecha_produccion que envía la HojaFabricacion como referencia."
  ],
  "recomendacion_activacion": "Puedes activar el producto en BD. El workflow pina lo identificará por prefijo EAN sin cambios adicionales.",
  "producto_analizado": {
    "id": 68,
    "cliente": "LIDL SUPERMERCADOS, S.A.U",
    "nombre_sap": "PIÑA CILINDRO 06X540 LIDL VD CHEF SELECT"
  },
  "fecha_informe": "6/7/2026, 12:47:09"
}
```

**Nota histórica**: por diseño de n8n con "Respond With: First Incoming Item", el objeto viaja directamente sin envolver. En versiones anteriores del pack se documentó incorrectamente como array. El código robusto debería contemplar ambos formatos (`Array.isArray(raw) ? raw[0] : raw`), pero hoy el formato real es siempre objeto plano.

### Estados posibles del campo `estado` en cada comparación:

| Estado | Significado |
|---|---|
| `OK` | Valor rellenado y detectado coinciden. |
| `OK (similar)` | Coinciden por contención parcial (ej. cliente con sufijo legal). |
| `OK (rellenado)` | El valor detectado es null pero el rellenado tiene valor (normal en campos no visibles en la etiqueta). |
| `OK (variable precio)` | Aplicable al gramaje: null es correcto para peso variable. |
| `OK (no verificable)` | No se puede verificar (ej. cliente no deducible por prefijo cuando el producto es único). |
| `REVISAR (rellena)` | El valor rellenado está vacío pero la etiqueta muestra algo. Sugerir revisar. |
| `REVISAR (¿obligatorio?)` | Detectado algo que requiere confirmación humana. |
| `DIFIERE` | Los valores rellenado y detectado son claramente distintos. |

### Valores clave a mostrar destacados:

- **`clasificacion`**: `ESTANDAR` o `EXCEPCION`. Verde vs rojo en la UI.
- **`recomendacion_activacion`**: texto directo para mostrar al usuario.
- **`motivos_excepcion`**: array de strings con los motivos (solo si `EXCEPCION`).
- **`notas`**: array de strings con avisos informativos.

---

## 5. UI propuesta (mockup textual)

### Pantalla Maestro de Productos → Producto seleccionado

Añadir un botón **al lado del "Lanzar a producción"** actual:

```
[✓ Analizar etiqueta con IA]   [◉ Lanzar a producción]
```

El botón "Analizar etiqueta con IA" solo se muestra cuando hay un producto seleccionado.

### Modal al pulsar "Analizar etiqueta con IA"

```
┌────────────────────────────────────────────┐
│  Análisis IA de etiqueta          [X]      │
├────────────────────────────────────────────┤
│                                            │
│  Producto: PIÑA CILINDRO 06X540 LIDL VD    │
│           CHEF SELECT                      │
│  Cliente:  LIDL SUPERMERCADOS, S.A.U       │
│                                            │
│  Sube una foto nítida de la etiqueta:      │
│  [Elegir archivo] o [Arrastra aquí]        │
│                                            │
│  [Analizar]                                │
└────────────────────────────────────────────┘
```

### Modal después del análisis (caso ESTANDAR)

```
┌────────────────────────────────────────────────────┐
│  Resultado del análisis            [X]              │
├────────────────────────────────────────────────────┤
│                                                    │
│  ✅ CUMPLE ESTÁNDAR                                 │
│                                                    │
│  Recomendación:                                    │
│  Puedes activar el producto en BD. El workflow     │
│  pina lo identificará por prefijo EAN sin          │
│  cambios adicionales.                              │
│                                                    │
│  ── Detectado en la etiqueta ──                    │
│  EAN:              2 276340 004505                 │
│  Tipo EAN:         variable_precio_9_3_1           │
│  Peso neto:        0.628 Kg                        │
│  Precio/kg:        6.45 €/Kg                       │
│  Importe:          4.05 €                          │
│  Fecha caducidad:  14.07.26                        │
│  Idioma:           español                         │
│  Marca:            chef select                     │
│  Origen:           Costa Rica                      │
│                                                    │
│  ── Comparación con lo rellenado ──                │
│  cliente        OK (no verificable)                │
│  ean_prefijo    OK                                 │
│  tipo_ean       OK                                 │
│  ...                                               │
│                                                    │
│  ── Notas ──                                        │
│  • Marca "chef select" detectada. Cuidado si       │
│    hay otro SKU LIDL con marca distinta.           │
│  • La etiqueta no muestra fecha de envasado.       │
│                                                    │
│  [Cerrar]      [Lanzar a producción →]             │
└────────────────────────────────────────────────────┘
```

### Modal después del análisis (caso EXCEPCION)

```
┌────────────────────────────────────────────────────┐
│  Resultado del análisis            [X]              │
├────────────────────────────────────────────────────┤
│                                                    │
│  ⚠️ REQUIERE EXCEPCIÓN                              │
│                                                    │
│  Recomendación:                                    │
│  NO activar el producto todavía. Se necesita       │
│  añadir lógica al workflow pina para: [motivos].   │
│                                                    │
│  ── Motivos de excepción ──                        │
│  • Etiqueta sin EAN legible. Requiere heurística   │
│    de identificación por otras señales.            │
│                                                    │
│  ── Cómo continuar ──                              │
│  Copia el informe completo y ábrelo con el         │
│  equipo técnico para añadir la lógica al workflow. │
│                                                    │
│  [Copiar informe]  [Cerrar]                        │
└────────────────────────────────────────────────────┘
```

Botón "Copiar informe" copia al portapapeles el JSON completo del análisis.

---

## 6. Flujo end-to-end

1. Compa entra en Maestros → Productos → clica un producto con `pendiente_lanzar = true`.
2. Rellena los campos del formulario (tabs Identificación, Logística, Producción, Precios).
3. Pulsa **"Analizar etiqueta con IA"**.
4. Sube foto de la etiqueta del bote.
5. Frontend envía la foto + los campos rellenados al backend.
6. Backend hace fetch al webhook n8n (con multipart).
7. n8n devuelve JSON de análisis en 3-8 segundos.
8. Frontend muestra el modal de resultado.
9. Si `ESTANDAR`: compa pulsa "Lanzar a producción" y ya está.
10. Si `EXCEPCION`: compa contacta con equipo técnico para ajustar workflow, no lanza todavía.

---

## 7. Manejo de errores

### Errores posibles

- **HTTP 4xx / 5xx**: fallo del webhook n8n.
- **`error: true` en el JSON de respuesta**: fallo controlado interno del workflow (ej. la IA no devolvió JSON válido, o falta `producto_json`).

### Ejemplo de respuesta con error controlado

Errores controlados incluyen `error: true`, `mensaje_error`, y también `clasificacion: "REINTENTAR"`:

```json
{
  "error": true,
  "mensaje_error": "El campo 'producto_json' no es un JSON válido.",
  "detalle": "SyntaxError: Unexpected token...",
  "clasificacion": "REINTENTAR"
}
```

Recomendación de manejo robusto:

```javascript
const raw = await res.json();
// Por si en alguna versión futura viniera envuelto en array
const data = Array.isArray(raw) ? raw[0] : raw;
if (data?.error === true || data?.clasificacion === 'REINTENTAR') {
  // mostrar data.mensaje_error como aviso al usuario
} else {
  // procesar informe normal
}
```

### Timeout recomendado

30 segundos. La llamada tarda típicamente entre 3 y 8 segundos, pero puede subir si OpenAI está saturado.

---

## 8. Consideraciones

- **Coste**: cada análisis cuesta aproximadamente 0.0004 € en tokens OpenAI. Se usa poco (solo para dar de alta clientes), así que el coste anual es despreciable.
- **Modelo**: gpt-4o-mini con visión, el mismo que ya está en uso en los otros workflows del sistema. Sin API keys nuevas ni configuraciones adicionales.
- **Persistencia**: el workflow n8n no guarda el análisis en ningún sitio. Si queréis histórico, guardadlo en vuestra BD (ej. tabla `analisis_etiqueta_log`).
- **Fotos**: no se almacenan tras el análisis. Si queréis histórico visual, guardad la foto en vuestro sistema antes o después de la llamada.

---

## 9. Referencias

- **Prompt actual del OpenAI**: `docs/workflows/analisis-etiqueta-alta-prompt.md` en el repo del lector.
- **Code JS del workflow**: `docs/workflows/analisis-etiqueta-alta.js` en el repo del lector.
- **Spec técnica completa**: `docs/workflows/analisis-etiqueta-alta.md` en el repo del lector.
- **Test HTML local** (para probar el webhook sin UI): `docs/workflows/test-analisis-etiqueta.html`.

Cualquier duda técnica: contactar al mantenedor del repo del lector.
