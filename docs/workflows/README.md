## Snapshots de workflows n8n

Esta carpeta guarda una copia versionada del code node de cada workflow n8n que interviene en el sistema del lector.

### Propósito
- Tener siempre disponible la versión actual del código para consultarlo desde herramientas externas (Claude Code, análisis IA, etc.) sin depender de acceso a n8n.
- Versionar cambios en git (histórico + blame).
- Punto único de verdad al que se sincroniza siempre después de tocar un workflow.

### Disciplina
Cada vez que se modifica un workflow en n8n, hay que:
1. Copiar el code node completo desde n8n.
2. Pegarlo en el archivo `.js` correspondiente (reemplazando el contenido anterior).
3. Actualizar `ultima_actualizacion` en el comentario cabecera.
4. Commit al repo.

### Ficheros

- `pina.js` — Workflow **piña**. Procesa etiquetas de piña cilindro (todos los clientes con este formato). Barrera EAN-cliente, barrera producto, desambiguación Chef Select.
- `coco.js` — Workflow **coco**. Procesa etiquetas de coco. Heurísticas GUFRESCO/GELATS (sin EAN, lote 3 dig).
- `tacos-frontal.js` — Workflow **tacos-frontal**. Procesa la etiqueta FILM del flujo DELMONTE TACOS 3-fases. Lookup BD para P+X.
- `caja.js` — Workflow **caja**. Procesa la etiqueta de la caja exterior (solo para clientes con `etiqueta_de_caja=true`). Validación DUN y datos vs bote.
- `analisis-etiqueta-alta.js` — (pendiente) Workflow para análisis IA de alta de clientes nuevos.

### Convención de cabecera

Cada archivo empieza con un comentario:

```js
/**
 * NODO: Code JavaScript - <NOMBRE_WORKFLOW>
 * Versión: <número>
 * ultima_actualizacion: YYYY-MM-DD
 * Snapshot desde n8n. NO editar aquí — la fuente de verdad es n8n.
 * Sincronizar tras cualquier cambio en el workflow.
 */
```
