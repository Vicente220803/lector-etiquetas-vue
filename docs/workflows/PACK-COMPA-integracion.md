# Pack de integración — Análisis IA de etiquetas para alta de clientes

Documento para el equipo de cmi-operaciones. Especifica cómo integrar la funcionalidad "Analizar etiqueta con IA" en el Maestro de Productos.

Última actualización: 2026-07-08 (añadida sección 10 — Capa 2 rama CAJA).

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

## 10. Extensión Capa 2 — Análisis de etiqueta de CAJA (nuevo)

Añadida el 2026-07-08. **No urgente** — solo se necesita cuando aparezca el primer cliente NUEVO con `etiqueta_de_caja=true`. La sección 1-9 sigue siendo válida tal cual para el 90% de casos (productos sin etiqueta de caja).

### 10.1 Motivación

Algunos productos (MERCADONA, ALDI, CONSUM, DELMONTE, y cualquier futuro cliente) tienen `etiqueta_de_caja=true` en BD. Además de la etiqueta del bote/tarrina, tienen una etiqueta exterior en la caja de embalaje que también verifica el sistema (workflow `caja` en n8n).

Cuando el compa da de alta un cliente nuevo con etiqueta de caja, ahora existe un segundo webhook que:
1. Analiza la foto de la etiqueta de la CAJA.
2. Cross-checkea las señas detectadas contra los 7 patrones que hoy reconoce el workflow `caja` (código de proveedor MERCADONA 948716, EAN caja ALDI 6012873, DUN CONSUM 3843701912201, etc.).
3. Devuelve si la caja YA está soportada, si NO lo está (y qué señas se detectaron para añadir regex), o si es ambigua.

### 10.2 Endpoint del webhook CAJA

**URL producción**:
```
POST https://surexportlevante.app.n8n.cloud/webhook/33fcb05d-8168-4b97-bcd2-b9adcb619db2
```

(URL con UUID generado automáticamente por n8n Cloud. Si en el futuro se cambia por un slug legible tipo `analisis-etiqueta-alta-CAJA`, actualizar aquí.)

**Content-Type**: `multipart/form-data` (mismo formato que el webhook bote).

**Auth**: ninguna.

### 10.3 Cuándo llamar a este webhook

Solo cuando el compa esté analizando la etiqueta de la **CAJA** de un producto con `etiqueta_de_caja=true`. Para el bote sigue usándose el webhook original.

Recomendación UI: cuando el producto seleccionado tenga `etiqueta_de_caja === true`, el modal "Analizar etiqueta con IA" debe mostrar un selector previo:

```
┌────────────────────────────────────────────┐
│  ¿Qué vas a analizar?          [X]         │
├────────────────────────────────────────────┤
│                                            │
│  Este producto tiene etiqueta de caja.     │
│  Puedes analizar cada una por separado:    │
│                                            │
│  [🥫 Etiqueta del BOTE]                    │
│  [📦 Etiqueta de la CAJA]                  │
│                                            │
└────────────────────────────────────────────┘
```

Según elección, el modal siguiente cambia el destino de la llamada (webhook bote o webhook caja) y el label superior ("Foto de la etiqueta del bote" / "Foto de la etiqueta de la caja").

Si el producto tiene `etiqueta_de_caja === false`, el flujo es idéntico a hoy: se llama directamente al webhook bote sin preguntar nada.

### 10.4 Request (webhook CAJA)

Mismo formato que el webhook bote:

- `file` (binary, obligatorio): foto de la etiqueta EXTERIOR de la caja.
- `producto_json` (string, obligatorio): mismo JSON que se envía al webhook bote. La lógica solo usa `id`, `cliente`, `nombre_sap`, `dun` para contexto, no es crítico enviar todos los campos.

```javascript
async function analizarEtiquetaCaja(archivoFoto, productoObj) {
  const formData = new FormData();
  formData.append('file', archivoFoto);
  formData.append('producto_json', JSON.stringify(productoObj));

  const res = await fetch(
    'https://surexportlevante.app.n8n.cloud/webhook/33fcb05d-8168-4b97-bcd2-b9adcb619db2',
    { method: 'POST', body: formData }
  );

  if (!res.ok) throw new Error(`Error del webhook: ${res.status}`);
  return res.json();
}
```

### 10.5 Response (webhook CAJA)

Estructura **DISTINTA** del webhook bote — más simple:

```json
{
  "tipo_analisis": "CAJA",
  "senas_detectadas": {
    "codigo_proveedor": "948716",
    "codigo_articulo": "3024",
    "dun_ean14": null,
    "ean13_visible": null,
    "marca_texto_identificativo": "PIÑA RODAJAS",
    "producto_texto": "PIÑA RODAJAS",
    "formato": null,
    "unidades_por_caja": null,
    "fecha_caducidad": "15.07.26",
    "lote": null,
    "proveedor_nombre": "Surexport Levante, S.L.U."
  },
  "patrones_matched": [
    {
      "cliente": "MERCADONA SA",
      "descripcion": "Código de proveedor 948716"
    }
  ],
  "estado": "SOPORTADO",
  "clasificacion": "ESTANDAR",
  "recomendacion_activacion": "Workflow caja YA reconoce esta caja por patrón: \"Código de proveedor 948716\" (cliente MERCADONA SA). Solo asegúrate de rellenar el campo 'dun' en BD si aparece un DUN de 14 dígitos en la etiqueta. Puedes activar el producto.",
  "producto_analizado": {
    "id": 999,
    "cliente": "MERCADONA SA",
    "nombre_sap": "PIÑA RODAJAS MERCADONA"
  },
  "fecha_informe": "10/7/2026, 14:41:35"
}
```

### 10.6 Campos clave del response CAJA

| Campo | Valor | Cómo mostrarlo |
|---|---|---|
| `tipo_analisis` | Siempre `"CAJA"` | Discriminador para saber qué análisis es (útil si compartes el modal con el bote). |
| `estado` | `SOPORTADO` / `NO_SOPORTADO` / `AMBIGUO` | Verde / rojo / naranja. Etiqueta destacada. |
| `clasificacion` | `ESTANDAR` / `EXCEPCION` | Igual que el bote. `ESTANDAR` cuando `estado=SOPORTADO`, `EXCEPCION` en los otros dos. |
| `patrones_matched` | Array de 0, 1 o más patrones detectados | Mostrar cliente + descripción de cada uno. |
| `senas_detectadas` | Todo lo que la IA extrajo de la foto | Panel "Detectado en la etiqueta" (igual que el bote). |
| `recomendacion_activacion` | Texto directo | Mostrar prominentemente. |

### 10.7 Estados posibles y qué hacer

**`SOPORTADO`** 🟢
- Un solo patrón matcheó. La caja YA está reconocida por el workflow caja productivo.
- Recomendación: el compa puede activar el producto (asegurando que rellena `dun` en BD si detectó uno).

**`NO_SOPORTADO`** 🔴
- Ningún patrón matcheó. La caja tiene señas nuevas que el workflow caja no conoce todavía.
- Recomendación: el compa copia el informe y lo lleva a Claude Code / equipo técnico para añadir una nueva rama de reconocimiento al workflow `caja` en n8n.
- NO activar el producto todavía.

**`AMBIGUO`** 🟠
- Más de un patrón matcheó (raro pero posible si dos clientes comparten señas). Requiere desambiguar.
- Recomendación: revisar el `patrones_matched` y decidir manualmente + posiblemente añadir criterio adicional al workflow caja.

### 10.8 UI propuesta modal resultado CAJA (mockup)

```
┌────────────────────────────────────────────────────┐
│  Resultado del análisis (CAJA)      [X]             │
├────────────────────────────────────────────────────┤
│                                                    │
│  ✅ CUMPLE ESTÁNDAR — SOPORTADO                     │
│                                                    │
│  Recomendación:                                    │
│  Workflow caja YA reconoce esta caja por patrón:   │
│  "Código de proveedor 948716" (cliente MERCADONA   │
│  SA). Solo asegúrate de rellenar 'dun' en BD si    │
│  aparece un DUN de 14 dígitos.                     │
│                                                    │
│  ── Detectado en la etiqueta ──                    │
│  Código proveedor: 948716                          │
│  Código artículo:  3024                            │
│  Producto:         PIÑA RODAJAS                    │
│  Fecha caducidad:  15.07.26                        │
│  Proveedor:        Surexport Levante, S.L.U.       │
│                                                    │
│  ── Patrones matcheados ──                         │
│  • MERCADONA SA — Código de proveedor 948716       │
│                                                    │
│  [Cerrar]  [Copiar informe]                        │
└────────────────────────────────────────────────────┘
```

Para caso `NO_SOPORTADO`: badge rojo, motivo = `recomendacion_activacion` completo (que explica qué señas se detectaron y cómo añadir la regex al workflow caja).

### 10.9 Manejo de errores (webhook CAJA)

Idéntico al webhook bote — sección 7 aplica igual. Si `res.json()` devuelve `error: true` o `clasificacion: "REINTENTAR"`, mostrar aviso al usuario.

### 10.10 Coste y consideraciones

- **Coste**: mismo que el webhook bote (~0.0004 € por análisis, gpt-4o-mini). Solo se llama cuando el compa lo elige explícitamente (nunca ambos webhooks en la misma acción).
- **Frecuencia esperada**: baja. Solo cuando entra un cliente nuevo con etiqueta de caja (varias veces al año).
- **Ahorro**: al ser 2 webhooks separados, si el producto solo necesita análisis de bote (mayoría de casos), no se dispara la llamada de caja. Cero coste extra en los flujos actuales.

### 10.11 Referencias Capa 2

- **Prompt gpt-4o-mini específico caja**: `docs/workflows/analisis-etiqueta-alta-prompt-CAJA.md`.
- **Code JS del webhook caja**: `docs/workflows/analisis-etiqueta-alta-CAJA.js`.
- **Test HTML local** (mismo archivo que el bote, cambia solo la URL): `docs/workflows/test-analisis-etiqueta.html`.
- **Fuente de verdad de los 7 patrones actuales del workflow caja productivo**: `docs/workflows/caja.js`. Si se añade un patrón nuevo al workflow caja, actualizar el array `PATRONES_CAJA_SOPORTADOS` de `analisis-etiqueta-alta-CAJA.js` para que el análisis alta lo reconozca también.

---

## 11. Referencias generales

- **Prompt actual del OpenAI (bote)**: `docs/workflows/analisis-etiqueta-alta-prompt.md` en el repo del lector.
- **Prompt caja (Capa 2)**: `docs/workflows/analisis-etiqueta-alta-prompt-CAJA.md`.
- **Code JS del workflow (bote)**: `docs/workflows/analisis-etiqueta-alta.js`.
- **Code JS del workflow (caja, Capa 2)**: `docs/workflows/analisis-etiqueta-alta-CAJA.js`.
- **Spec técnica completa**: `docs/workflows/analisis-etiqueta-alta.md`.
- **Test HTML local**: `docs/workflows/test-analisis-etiqueta.html` (tiene ambas URLs pre-configuradas).

Cualquier duda técnica: contactar al mantenedor del repo del lector.
