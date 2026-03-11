<template>
  <div v-if="show" class="modal-overlay" @click="closeModal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <button type="button" @click="closeModal" class="back-button" aria-label="Volver atrás">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <h2 id="modal-title">Verificación de Trazabilidad</h2>
      </div>
      <form @submit.prevent="saveData" class="edit-form">
        <div class="modal-body">
          <!-- BANNER DE P+X VALIDADO -->
          <div v-if="esPxCorrecto && pxConfirmado && data && data.validacion_px" class="px-success-banner">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="#48bb78"/>
              <path d="M8 12l2 2 4-4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>P+X Correcto: <strong>{{ px_usuario }} días</strong></span>
          </div>

          <!-- SECCIÓN DE PREGUNTA INTERACTIVA (P+X) - Siempre aparece para verificación -->
          <div v-if="data && data.validacion_px" class="question-card">
            <div class="question-icon">❓</div>
            <div class="question-body">
              <label class="question-label">PREGUNTA DE SEGURIDAD:</label>
              <p class="question-text">
                Para el cliente <strong>{{ data.cliente }}</strong> en <strong>{{ data.validacion_px.dia_semana_nombre }}</strong>, 
                ¿cuántos días de vida útil (P+X) corresponden?
              </p>
              
              <div class="input-verify-wrapper">
                <input
                  v-model.number="px_usuario"
                  type="number"
                  class="px-verify-input"
                  placeholder="?"
                >
                <button
                  type="button"
                  @click="confirmarPx"
                  class="confirm-px-button"
                  :disabled="px_usuario === null || px_usuario === ''"
                >
                  Confirmar
                </button>
                <div v-if="pxConfirmado" class="verification-status">
                  <span v-if="esPxCorrecto" class="status-ok">✅ ¡Correcto!</span>
                  <span v-else class="status-error">❌ No coincide</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ERROR DE IA / BLOQUEO DE SERVICIO -->
          <div v-if="data && data.bloqueo_ia" class="critical-alert error-bloqueo">
            <strong>🛑 ERROR DEL SERVICIO:</strong>
            <p>{{ data.mensaje_error || 'Error al procesar la imagen. Intenta de nuevo.' }}</p>
          </div>

          <!-- AVISO SI HAY ERROR EN LA VALIDACIÓN -->
          <div v-if="hayErrorSanitarioReal" class="critical-alert">
            <strong>⚠️ ALERTA SANITARIA:</strong>
            <div v-if="Number(px_usuario) !== Number(data?.validacion_px?.px_leido)">
              <p>❌ <strong>ERROR:</strong> La etiqueta marca <strong>P+{{ data?.validacion_px?.px_leido }}</strong>, pero ingresaste <strong>P+{{ px_usuario }}</strong>. Deben coincidir.</p>
            </div>
            <div v-else>
              <p>⚠️ <strong>AVISO:</strong> P+{{ px_usuario }} está <strong>FUERA del rango aceptable</strong> para {{ formData.cliente }} (rango: {{ pxRangosPorCliente[formData.cliente]?.min }}-{{ pxRangosPorCliente[formData.cliente]?.max }}). ¡No permitas el etiquetado!</p>
            </div>
          </div>

          <!-- CONFIRMACIÓN FINAL (Solo aparece si P+X es correcto) -->
          <div v-if="esPxCorrecto && !confirmacionFinal" class="confirmation-card">
            <div class="confirmation-icon">✓</div>
            <div class="confirmation-body">
              <label class="confirmation-label">VERIFICACIÓN FINAL:</label>
              <p class="confirmation-text">
                P+X validado correctamente. Ahora verifica que <strong>todos los datos</strong> coincidan con la etiqueta física:
              </p>

              <div class="confirmation-grid">
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Cliente</span>
                  <span class="confirmation-value">{{ formData.cliente }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Producto</span>
                  <span class="confirmation-value">{{ formData.producto_db || 'N/A' }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Origen</span>
                  <span class="confirmation-value">{{ formData.origen }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">EAN</span>
                  <span class="confirmation-value">{{ formData.ean }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Lote</span>
                  <span class="confirmation-value">{{ formData.lote }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Código R</span>
                  <span class="confirmation-value">{{ formData.codigo_r }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Envasado</span>
                  <span class="confirmation-value">{{ formData.fecha_envasado }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Caducidad</span>
                  <span class="confirmation-value">{{ formData.fecha_caducidad }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Precio/Kg</span>
                  <span class="confirmation-value">{{ formData.precio_kg }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Peso Neto</span>
                  <span class="confirmation-value">{{ formData.peso_neto }}</span>
                </div>
                <div class="confirmation-item">
                  <span class="confirmation-label-small">Importe</span>
                  <span class="confirmation-value">{{ formData.importe }}</span>
                </div>
                <div class="confirmation-item confirmation-item-highlight">
                  <span class="confirmation-label-small">P+X Verificado</span>
                  <span class="confirmation-value confirmation-value-highlight">{{ px_usuario }} días</span>
                </div>
              </div>

              <p class="confirmation-question">¿Todos los datos son correctos?</p>

              <div class="confirmation-buttons">
                <button
                  type="button"
                  @click="confirmacionFinal = true"
                  class="confirm-final-button"
                >
                  ✓ Sí, todo es correcto
                </button>
                <button
                  type="button"
                  @click="confirmacionFinal = false; pxConfirmado = false"
                  class="cancel-final-button"
                >
                  ✗ No, revisar
                </button>
              </div>
            </div>
          </div>

          <!-- FORMULARIO DE DATOS (Se puede ver pero el botón guardar depende de la pregunta) -->
          <div class="form-section-title">Datos extraídos de la etiqueta</div>
          
          <div class="form-group">
            <label for="cliente">Cliente</label>
            <input v-model="formData.cliente" type="text" id="cliente" readonly class="input-readonly">
          </div>
          <div class="form-group">
            <label for="producto_db">Producto (SAP/BD)</label>
            <input v-model="formData.producto_db" type="text" id="producto_db" :readonly="formData.producto_db !== 'No encontrado en BD' && formData.producto_db !== ''" class="input-product">
          </div>
          <div class="form-group">
            <label for="origen">Origen</label>
            <input v-model="formData.origen" type="text" id="origen" readonly class="input-readonly">
          </div>
          <div class="form-group">
            <label for="ean">EAN (Extraído)</label>
            <input v-model="formData.ean" type="text" id="ean" readonly class="input-readonly">
          </div>

          <!-- CAMPO DE ESCANEO DE EAN - OBLIGATORIO -->
          <div class="form-group barcode-section" :class="{ 'barcode-pulse': !eanEscaneado && confirmacionFinal }">
            <label for="eanEscaneado">
              <span class="scan-label">
                <svg class="barcode-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="3" width="2" height="18" fill="currentColor"/>
                  <rect x="5" y="3" width="1" height="18" fill="currentColor"/>
                  <rect x="7" y="3" width="2" height="18" fill="currentColor"/>
                  <rect x="10" y="3" width="1" height="18" fill="currentColor"/>
                  <rect x="12" y="3" width="2" height="18" fill="currentColor"/>
                  <rect x="15" y="3" width="1" height="18" fill="currentColor"/>
                  <rect x="17" y="3" width="2" height="18" fill="currentColor"/>
                  <rect x="20" y="3" width="2" height="18" fill="currentColor"/>
                </svg>
                Escanear código de barras (OBLIGATORIO)
              </span>
            </label>
            <input
              ref="eanInput"
              v-model="eanEscaneado"
              type="text"
              id="eanEscaneado"
              placeholder="Pistola apuntando aquí..."
              class="input-scan"
              :class="{ 'input-scan-active': confirmacionFinal && !eanEscaneado }"
              @keydown.enter="eanValidado = true"
            >

            <!-- RESULTADO DE VALIDACIÓN DE EAN -->
            <div v-if="eanEscaneado" class="ean-validation">
              <div v-if="eanCoincide === true" class="ean-match success">
                <span class="ean-icon">✅</span>
                <span class="ean-text">
                  <strong>¡Perfecto!</strong> EANs coinciden
                </span>
              </div>
              <div v-else-if="eanCoincide === false" class="ean-match error">
                <span class="ean-icon">❌</span>
                <span class="ean-text">
                  <strong>Error:</strong> EAN NO coincide
                  <br><small>OCR: {{ formData.ean }}</small>
                  <br><small>Escan: {{ eanEscaneado }}</small>
                </span>
              </div>
            </div>

            <!-- ADVERTENCIA SI FALTA ESCANEAR -->
            <div v-if="confirmacionFinal && !eanEscaneado" class="barcode-required">
              <span class="pulse-dot"></span>
              <strong>⚠️ ESCANEA EL CÓDIGO AHORA</strong>
            </div>
          </div>
          <div class="form-group">
            <label for="lote">Lote</label>
            <input v-model="formData.lote" type="text" id="lote" readonly class="input-readonly">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="fecha_envasado">Fecha Envasado</label>
              <input v-model="formData.fecha_envasado" type="text" id="fecha_envasado" readonly class="input-readonly">
            </div>
            <div class="form-group">
              <label for="fecha_caducidad">Fecha Caducidad</label>
              <input v-model="formData.fecha_caducidad" type="text" id="fecha_caducidad" readonly class="input-readonly">
            </div>
          </div>
          <div class="form-group">
            <label for="codigo_r">Código R</label>
            <input v-model="formData.codigo_r" type="text" id="codigo_r" readonly class="input-readonly">
          </div>
          <div class="form-group">
            <label for="precio_kg">Precio/Kg</label>
            <input v-model="formData.precio_kg" type="text" id="precio_kg" readonly class="input-readonly">
          </div>
          <div class="form-group">
            <label for="peso_neto">Peso Neto</label>
            <input v-model="formData.peso_neto" type="text" id="peso_neto" readonly class="input-readonly">
          </div>
          <div class="form-group">
            <label for="importe">Importe</label>
            <input v-model="formData.importe" type="text" id="importe" readonly class="input-readonly">
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" @click="closeModal" class="cancel-button">
            Cancelar
          </button>
          
          <!-- BOTÓN GUARDAR: Solo activo si P+X es correcto Y confirmación final Y barcode escaneado -->
          <button
            type="submit"
            class="save-button"
            :disabled="!puedeGuardar"
          >
            <span v-if="puedeGuardar">✓ Guardar Registro</span>
            <span v-else-if="!esPxCorrecto">Responda P+X para continuar</span>
            <span v-else-if="!confirmacionFinal">Confirme los datos para continuar</span>
            <span v-else>⚠️ Escanee el código de barras</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  show: Boolean,
  data: Object
})

const emit = defineEmits(['save', 'close'])

// Estado local para la pregunta
const px_usuario = ref(null)
const pxConfirmado = ref(false)
const confirmacionFinal = ref(false)
const eanEscaneado = ref('')
const eanValidado = ref(false)
const formData = ref({
  cliente: '',
  producto_db: '',
  origen: '',
  ean: '',
  lote: '',
  fecha_envasado: '',
  fecha_caducidad: '',
  codigo_r: '',
  precio_kg: '',
  peso_neto: '',
  importe: ''
})

// Vigilamos la entrada de datos para resetear la pregunta
watch(() => props.data, (newData) => {
  if (newData) {
    formData.value = { ...newData }
    px_usuario.value = null
    pxConfirmado.value = false
    eanEscaneado.value = ''
    confirmacionFinal.value = false
  }
}, { immediate: true })

const confirmarPx = () => {
  console.log('📋 DEBUG P+X:')
  console.log('px_usuario (lo que ingresaste):', px_usuario.value, 'tipo:', typeof px_usuario.value)
  console.log('px_esperado (del servidor):', props.data?.validacion_px?.px_esperado, 'tipo:', typeof props.data?.validacion_px?.px_esperado)
  pxConfirmado.value = true
}

// Rangos aceptables de P+X por cliente
const pxRangosPorCliente = {
  'LIDL': { min: 8, max: 9 },
  'ALDI': { min: 8, max: 9 },
  'DELMONTE': { min: 8, max: 9 },
  'MERCADONA SA': { min: 5, max: 5 }
}

// Función para verificar si el P+X está dentro del rango aceptable
const verificarPxEnRango = (cliente, pxValue) => {
  const rango = pxRangosPorCliente[cliente]
  if (!rango) return false
  return pxValue >= rango.min && pxValue <= rango.max
}

// Lógica de comprobación del P+X
const esPxCorrecto = computed(() => {
  if (!props.data || !props.data.validacion_px) return true // Si no hay validación, permitir guardar

  if (!pxConfirmado.value) return false

  const pxValue = Number(px_usuario.value)
  const pxLeido = Number(props.data.validacion_px.px_leido) // Lo que la etiqueta REALMENTE dice
  const cliente = formData.value.cliente
  const rango = pxRangosPorCliente[cliente]

  // PRIMERO: El usuario debe ingresar lo que la etiqueta realmente marca
  if (pxValue !== pxLeido) {
    return false // Error: no coincide con lo que marca la etiqueta
  }

  // SEGUNDO: Verificar que ese valor esté en el rango aceptable
  if (!rango) {
    // Si no hay rango definido, solo validar que sea igual a px_leido
    return true
  }

  // Validar que esté dentro del rango
  return pxValue >= rango.min && pxValue <= rango.max
})

// Verificar que se haya confirmado la validación final
const puedeGuardar = computed(() => {
  // Debe tener P+X correcto, confirmación final
  if (!esPxCorrecto.value || !confirmacionFinal.value) return false

  // BARCODE ES OBLIGATORIO - Debe escanear y debe coincidir
  if (!eanEscaneado.value || eanCoincide.value !== true) return false

  return true
})

// Verificar si hay error sanitario REAL
const hayErrorSanitarioReal = computed(() => {
  if (!props.data || !props.data.validacion_px || !pxConfirmado.value) return false

  const pxValue = Number(px_usuario.value)
  const pxLeido = Number(props.data.validacion_px.px_leido)
  const cliente = formData.value.cliente

  // Error 1: Usuario ingresó diferente a lo que la etiqueta marca
  if (pxValue !== pxLeido) {
    return true
  }

  // Error 2: Lo que marca la etiqueta está FUERA del rango aceptable
  if (!verificarPxEnRango(cliente, pxLeido)) {
    return true
  }

  return false
})

// Verificar coincidencia de EANs (OCR vs Escaneado)
const eanCoincide = computed(() => {
  if (!eanEscaneado.value) return null // Sin validar si no hay escaneo

  const eanOCR = formData.value.ean?.trim() || ''
  const eanEscan = eanEscaneado.value.trim()

  return eanOCR === eanEscan
})

const saveData = () => {
  if (esPxCorrecto.value) {
    const cleanData = {
      cliente: formData.value.cliente,
      producto_db: formData.value.producto_db,
      origen: formData.value.origen,
      ean: formData.value.ean,
      lote: formData.value.lote,
      fecha_envasado: formData.value.fecha_envasado,
      fecha_caducidad: formData.value.fecha_caducidad,
      codigo_r: formData.value.codigo_r,
      precio_kg: formData.value.precio_kg,
      peso_neto: formData.value.peso_neto,
      importe: formData.value.importe,
      px_usuario: px_usuario.value
    }
    emit('save', cleanData)
    emit('close')
  }
}

const closeModal = () => {
  emit('close')
}
</script>

<style scoped>
/* ESTILOS DE LA TARJETA DE PREGUNTA */
.question-card {
  background: #ffffff;
  border: 3px solid #667eea;
  border-radius: 20px;
  padding: 28px;
  margin-bottom: 30px;
  display: flex;
  gap: 20px;
  box-shadow: 0 12px 28px rgba(102, 126, 234, 0.2);
}

.question-icon {
  font-size: 32px;
  background: #f0f4ff;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.question-body {
  flex: 1;
  text-align: left;
}

.question-label {
  font-size: 11px;
  font-weight: 800;
  color: #667eea;
  letter-spacing: 1px;
}

.question-text {
  margin: 5px 0 15px 0;
  font-size: 15px;
  color: #2d3748;
  line-height: 1.4;
}

.input-verify-wrapper {
  display: flex;
  align-items: center;
  gap: 15px;
}

.px-verify-input {
  width: 110px !important;
  height: 56px;
  text-align: center;
  font-size: 28px !important;
  font-weight: 800 !important;
  border: 3px solid #e2e8f0 !important;
  border-radius: 12px !important;
  color: #667eea !important;
  transition: all 0.2s;
}

.px-verify-input:focus {
  border-color: #667eea !important;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
  outline: none;
}

.verification-status {
  font-weight: 700;
  font-size: 14px;
}

.status-ok { color: #38a169; }
.status-error { color: #e53e3e; }

.confirm-px-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 48px;
}

.confirm-px-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.confirm-px-button:disabled {
  background: #cbd5e0;
  cursor: not-allowed;
  opacity: 0.6;
}

/* BANNER DE P+X VALIDADO */
.px-success-banner {
  background: linear-gradient(135deg, #c6f6d5 0%, #9ae6b4 100%);
  border: 2px solid #48bb78;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #22543d;
  font-weight: 600;
  font-size: 16px;
  animation: slideDown 0.4s ease-out;
}

.px-success-banner strong {
  color: #276749;
  font-weight: 700;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ALERTA CRÍTICA */
.critical-alert {
  background: #fff5f5;
  border-left: 5px solid #f56565;
  padding: 15px;
  margin-bottom: 20px;
  border-radius: 0 10px 10px 0;
  text-align: left;
}

.critical-alert strong { color: #c53030; display: block; margin-bottom: 5px; }
.critical-alert p { margin: 0; font-size: 13px; color: #742a2a; }

.error-bloqueo { border-left-color: #dc2626; background: #fef2f2; }
.error-bloqueo strong { color: #991b1b; }
.error-bloqueo p { color: #7f1d1d; }

.form-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #a0aec0;
  text-transform: uppercase;
  margin: 20px 0 10px 0;
  text-align: left;
  border-bottom: 1px solid #edf2f7;
  padding-bottom: 5px;
}

/* ESTILOS BASE DEL MODAL */
.modal-overlay {
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.modal-content {
  background-color: #ffffff;
  border-radius: 24px;
  width: 95%;
  max-width: 700px;
  max-height: 90vh;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 28px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-header h2 { margin: 0; font-size: 26px; font-weight: 700; }

.back-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 8px;
  padding: 8px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.back-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.modal-body {
  padding: 25px;
  overflow-y: scroll;
  max-height: 50vh;
}

.edit-form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.form-group { margin-bottom: 18px; text-align: left; }
.form-group label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #2d3748; }
.form-group input { width: 100%; padding: 14px; border-radius: 10px; border: 2px solid #e2e8f0; box-sizing: border-box; font-size: 16px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.input-readonly { background-color: #f7fafc; color: #a0aec0; cursor: not-allowed; }
.input-product { background-color: #ffffff; color: #2d3748; }
.input-product:not([readonly]) { border-color: #f6ad55; background-color: #fffaf0; }
.input-product:not([readonly]):focus { border-color: #ed8936; box-shadow: 0 0 0 3px rgba(237, 137, 54, 0.1); }

/* ESTILOS DE CONFIRMACIÓN FINAL */
.confirmation-card {
  background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%);
  border: 3px solid #0284c7;
  border-radius: 20px;
  padding: 28px;
  margin-bottom: 30px;
  display: flex;
  gap: 20px;
  box-shadow: 0 12px 28px rgba(2, 132, 199, 0.15);
  animation: slideDown 0.4s ease-out;
}

.confirmation-icon {
  font-size: 40px;
  background: #0284c7;
  color: white;
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  font-weight: bold;
}

.confirmation-body {
  flex: 1;
  text-align: left;
}

.confirmation-label {
  font-size: 11px;
  font-weight: 800;
  color: #0284c7;
  letter-spacing: 1px;
}

.confirmation-text {
  margin: 5px 0 15px 0;
  font-size: 15px;
  color: #1e3a8a;
  line-height: 1.4;
  font-weight: 500;
}

.confirmation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 20px 0;
  padding: 15px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
}

.confirmation-item {
  display: flex;
  flex-direction: column;
  padding: 10px;
  background: white;
  border-radius: 8px;
  border-left: 3px solid #0284c7;
}

.confirmation-item-highlight {
  border-left-color: #16a34a;
  background: #f0fdf4;
}

.confirmation-label-small {
  font-size: 10px;
  font-weight: 700;
  color: #0284c7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.confirmation-item-highlight .confirmation-label-small {
  color: #16a34a;
}

.confirmation-value {
  font-size: 13px;
  font-weight: 600;
  color: #1e3a8a;
  word-break: break-word;
}

.confirmation-value-highlight {
  color: #16a34a;
  font-size: 14px;
  font-weight: 700;
}

.confirmation-question {
  margin: 20px 0 15px 0;
  font-size: 16px;
  color: #1e3a8a;
  font-weight: 700;
  text-align: center;
}

.confirmation-buttons {
  display: flex;
  gap: 12px;
  margin-top: 15px;
}

.confirm-final-button {
  flex: 1;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 48px;
}

.confirm-final-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(2, 132, 199, 0.3);
}

.cancel-final-button {
  flex: 1;
  background: white;
  color: #dc2626;
  border: 2px solid #dc2626;
  padding: 14px 24px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 48px;
}

.cancel-final-button:hover {
  background: #fef2f2;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
}

/* ESTILOS DE ESCANEO DE EAN */
.barcode-section {
  position: relative;
}

.barcode-section.barcode-pulse {
  animation: barcodePulse 1.5s ease-in-out infinite;
}

@keyframes barcodePulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}

.scan-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: #667eea;
}

.barcode-icon {
  color: #667eea;
  animation: barcodeGlow 1s ease-in-out infinite;
}

@keyframes barcodeGlow {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.input-scan {
  width: 100%;
  padding: 16px;
  border-radius: 10px;
  border: 2px solid #667eea;
  box-sizing: border-box;
  font-size: 16px;
  background-color: #f0f4ff;
  color: #667eea;
  font-weight: 600;
  text-align: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.input-scan:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 6px rgba(102, 126, 234, 0.15);
  background-color: white;
  transform: scale(1.01);
}

.input-scan.input-scan-active {
  border-color: #f59e0b;
  border-width: 3px;
  background-color: #fffbeb;
  box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.1), inset 0 0 0 2px rgba(245, 158, 11, 0.2);
  animation: scannerPulse 1.2s ease-in-out infinite;
}

@keyframes scannerPulse {
  0%, 100% {
    box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.1), inset 0 0 0 2px rgba(245, 158, 11, 0.2);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(245, 158, 11, 0.05), inset 0 0 0 2px rgba(245, 158, 11, 0.3);
  }
}

.input-scan::placeholder {
  color: #b4c7ff;
}

.barcode-required {
  margin-top: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 2px solid #f59e0b;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: #b45309;
  animation: slideDown 0.3s ease-out;
}

.pulse-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  background-color: #f59e0b;
  border-radius: 50%;
  animation: pulseDot 1.2s ease-in-out infinite;
}

@keyframes pulseDot {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.5;
  }
}

.ean-validation {
  margin-top: 12px;
}

.ean-match {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  animation: slideIn 0.3s ease-out;
}

.ean-match.success {
  background-color: #f0fdf4;
  border: 2px solid #22c55e;
  color: #16a34a;
}

.ean-match.error {
  background-color: #fef2f2;
  border: 2px solid #ef4444;
  color: #dc2626;
}

.ean-icon {
  font-size: 18px;
}

.ean-text {
  flex: 1;
  text-align: left;
}

.ean-text small {
  display: block;
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.8;
}

.modal-footer {
  padding: 20px;
  background-color: #f8fafc;
  display: flex;
  gap: 15px;
  flex-shrink: 0;
  border-top: 1px solid #e2e8f0;
  margin-top: auto;
}

.cancel-button {
  flex: 1;
  padding: 18px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: white;
  font-weight: 600;
  cursor: pointer;
  font-size: 16px;
  min-height: 52px;
  transition: all 0.2s;
}

.cancel-button:hover {
  background-color: #f7fafc;
}

.save-button {
  flex: 2;
  padding: 18px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
  font-weight: 700;
  cursor: pointer;
  font-size: 16px;
  min-height: 52px;
  transition: all 0.2s;
}

.save-button:disabled {
  background: #cbd5e0;
  cursor: not-allowed;
  opacity: 0.7;
}
</style>