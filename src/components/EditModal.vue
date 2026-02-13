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

          <!-- SECCIÓN DE PREGUNTA INTERACTIVA (P+X) - Solo si no está validado -->
          <div v-if="data && data.validacion_px && !esPxCorrecto" class="question-card">
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

          <!-- AVISO SI LA ETIQUETA ESTÁ MAL IMPRESA (ERROR SANITARIO) -->
          <div v-if="data && data.error_sanitario && esPxCorrecto" class="critical-alert">
            <strong>⚠️ ALERTA SANITARIA:</strong>
            <p>Has respondido bien, pero la <strong>etiqueta física</strong> tiene una fecha de caducidad incorrecta (marcaría un P+{{ data.validacion_px.px_leido }}). ¡No permitas el etiquetado!</p>
          </div>

          <!-- FORMULARIO DE DATOS (Se puede ver pero el botón guardar depende de la pregunta) -->
          <div class="form-section-title">Datos extraídos de la etiqueta</div>
          
          <div class="form-group">
            <label for="cliente">Cliente</label>
            <input v-model="formData.cliente" type="text" id="cliente" readonly class="input-readonly">
          </div>
          <div class="form-group">
            <label for="origen">Origen</label>
            <input v-model="formData.origen" type="text" id="origen" readonly class="input-readonly">
          </div>
          <div class="form-group">
            <label for="ean">EAN</label>
            <input v-model="formData.ean" type="text" id="ean" readonly class="input-readonly">
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
          
          <!-- BOTÓN GUARDAR: Solo activo si el P+X manual es correcto -->
          <button 
            type="submit" 
            class="save-button" 
            :disabled="!esPxCorrecto"
          >
            <span v-if="esPxCorrecto">✓ Guardar Registro</span>
            <span v-else>Responda P+X para continuar</span>
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
const formData = ref({
  cliente: '',
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
  }
}, { immediate: true })

const confirmarPx = () => {
  console.log('📋 DEBUG P+X:')
  console.log('px_usuario (lo que ingresaste):', px_usuario.value, 'tipo:', typeof px_usuario.value)
  console.log('px_esperado (del servidor):', props.data?.validacion_px?.px_esperado, 'tipo:', typeof props.data?.validacion_px?.px_esperado)
  pxConfirmado.value = true
}

// Lógica de comprobación
const esPxCorrecto = computed(() => {
  if (!props.data || !props.data.validacion_px) return true // Si no hay validación, permitir guardar

  if (!pxConfirmado.value) return false
  return Number(px_usuario.value) === Number(props.data.validacion_px.px_esperado)
})

const saveData = () => {
  if (esPxCorrecto.value) {
    const cleanData = {
      cliente: formData.value.cliente,
      origen: formData.value.origen,
      ean: formData.value.ean,
      lote: formData.value.lote,
      fecha_envasado: formData.value.fecha_envasado,
      fecha_caducidad: formData.value.fecha_caducidad,
      codigo_r: formData.value.codigo_r,
      precio_kg: formData.value.precio_kg,
      peso_neto: formData.value.peso_neto,
      importe: formData.value.importe
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