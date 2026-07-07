## Workflow n8n `analisis-etiqueta-alta` — spec

Workflow dedicado para análisis IA de alta de clientes nuevos.
Recibe foto + datos del producto ya rellenados y devuelve informe con clasificación estándar/excepción.

### URL del webhook

`POST https://surexportlevante.app.n8n.cloud/webhook/analisis-etiqueta-alta`

### Estructura del workflow

```
Webhook (POST multipart)
  ↓
Analyze image (OpenAI Vision - gpt-4o-mini)
  ↓
Get many rows (Supabase - productos activos, para detectar colisiones EAN)
  ↓
Code JavaScript (parsea + compara + clasifica)
  ↓
Respond to Webhook
```

### Request (multipart/form-data)

- `file`: foto de la etiqueta (JPEG/PNG).
- `producto_json`: string JSON con los campos actuales del producto en BD.

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

### Response (JSON)

```json
{
  "detectado_en_etiqueta": {
    "ean_completo": "2276340003884",
    "ean_prefijo_7dig": "2276340",
    "tipo_ean": "variable_precio_9_3_1",
    "peso_neto": "0.610 Kg",
    "precio_kg": "6.45 €/Kg",
    "importe": "3.93 €",
    "fecha_envasado_visible": false,
    "fecha_envasado": null,
    "fecha_caducidad": "07.07.26",
    "codigo_r": null,
    "codigo_r_visible": false,
    "lote_formato": "6 dígitos con separador",
    "lote_ejemplo": "002 180 1544 00",
    "idioma": "español",
    "marca_logo": "chef select",
    "origen": "Costa Rica",
    "producto_texto": "PIÑA RODAJAS"
  },
  "comparacion_con_campos_rellenados": [
    { "campo": "cliente", "valor_rellenado": "LIDL SUPERMERCADOS, S.A.U", "valor_detectado": "LIDL (por prefijo EAN)", "estado": "OK" },
    { "campo": "ean", "valor_rellenado": "227634000", "valor_detectado": "2276340xxx (prefijo)", "estado": "OK" },
    { "campo": "tipo_codigo_ean", "valor_rellenado": "Variable precio", "valor_detectado": "variable_precio_9_3_1", "estado": "OK" },
    { "campo": "gramaje_peso_fijo", "valor_rellenado": null, "valor_detectado": null, "estado": "OK (variable precio)" }
  ],
  "chequeo_colisiones_ean": {
    "prefijo_colisiona": false,
    "otros_productos_mismo_prefijo": []
  },
  "clasificacion": "ESTANDAR",
  "requiere_cambios_workflow": false,
  "workflow_destino": "pina",
  "notas": [
    "Marca 'chef select' detectada. Cuidado si aparece otro SKU LIDL con Chef Select en BD.",
    "Fecha caducidad sin año → el workflow asume año actual/siguiente automáticamente."
  ],
  "recomendacion_activacion": "Puedes activar el producto en BD. El workflow piña lo identificará por prefijo EAN sin cambios adicionales."
}
```

Si hubiera excepción:
```json
{
  "detectado_en_etiqueta": { ... },
  "comparacion_con_campos_rellenados": [ ... ],
  "chequeo_colisiones_ean": { ... },
  "clasificacion": "EXCEPCION",
  "requiere_cambios_workflow": true,
  "workflow_destino": "coco",
  "notas": [
    "Etiqueta en idioma no soportado (italiano). El workflow no tiene regex para 'scadenza'.",
    "Sin EAN legible. Requiere heurística nueva similar a ALABAU/ANTICH."
  ],
  "recomendacion_activacion": "NO activar el producto todavía. Abrir Claude Code con este informe. Se necesita añadir heurística en el workflow coco para: (1) regex de fecha caducidad en italiano ('scadenza'), (2) fallback heurístico sin EAN por origen + peso.",
  "cambios_workflow_sugeridos": [
    {
      "workflow": "coco",
      "descripcion": "Añadir regex fecha caducidad italiano",
      "insercion_donde": "después del bloque 'const fechaCadIA = ...'",
      "snippet": "// TODO: generar en sesión Claude Code con el snapshot"
    }
  ]
}
```

### Prompt para el nodo Analyze image (OpenAI gpt-4o-mini)

Ver archivo `docs/workflows/analisis-etiqueta-alta-prompt.md`.

### Code JS del nodo Code

Pendiente de redactar. Tareas del code:

1. Parsear el output de OpenAI.
2. Extraer los campos "detectado_en_etiqueta".
3. Cargar `productosDB` del nodo Supabase.
4. Chequear colisiones de prefijo EAN con otros productos activos.
5. Comparar campo por campo lo detectado vs lo rellenado (producto_json).
6. Clasificar ESTANDAR o EXCEPCION según criterios:
   - **ESTANDAR** si:
     - EAN detectado tiene prefijo único (no colisión con otro cliente).
     - Tipo EAN es variable_precio_9_3_1 o fijo_13.
     - Idioma es español o catalán (ya soportados por regex).
     - No hay código R obligatorio raro.
     - Formato lote conocido (3 dig o 6 dig).
   - **EXCEPCION** si cualquiera de estas condiciones:
     - Sin EAN legible (requiere heurística).
     - Prefijo EAN colisiona con otro cliente distinto.
     - Idioma nuevo (no español/catalán).
     - Formato fecha nuevo (no DD/MM/YY ni "Fecha Env" ni "caducitat").
     - Código R obligatorio en cliente que no es MERCADONA.
     - Formato lote irregular.
6. Determinar `workflow_destino`:
   - "coco" si nombre_sap contiene COCO.
   - "pina" en caso contrario.
7. Generar `notas` con avisos concretos.
8. Devolver JSON estructurado.
