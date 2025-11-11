<template>
  <div v-if="show" class="modal-overlay" @click="closeModal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2 id="modal-title">Confirmar Datos</h2>
      </div>
      <form @submit.prevent="saveData" class="edit-form">
        <div class="modal-body">
          <div class="form-group">
            <label for="cliente">Cliente</label>
            <input v-model="formData.cliente" type="text" id="cliente" aria-describedby="cliente-help">
            <small id="cliente-help" class="sr-only">Nombre del cliente</small>
          </div>
          <div class="form-group">
            <label for="origen">Origen</label>
            <input v-model="formData.origen" type="text" id="origen" aria-describedby="origen-help">
            <small id="origen-help" class="sr-only">País o región de origen</small>
          </div>
          <div class="form-group">
            <label for="ean">EAN</label>
            <input v-model="formData.ean" type="text" id="ean" aria-describedby="ean-help">
            <small id="ean-help" class="sr-only">Código EAN del producto</small>
          </div>
          <div class="form-group">
            <label for="lote">Lote</label>
            <input v-model="formData.lote" type="text" id="lote" aria-describedby="lote-help">
            <small id="lote-help" class="sr-only">Número de lote del producto</small>
          </div>
          <div class="form-group">
            <label for="fecha_envasado">Fecha Envasado</label>
            <input v-model="formData.fecha_envasado" type="text" id="fecha_envasado" aria-describedby="fecha-envasado-help">
            <small id="fecha-envasado-help" class="sr-only">Fecha en que se envasó el producto</small>
          </div>
          <div class="form-group">
            <label for="fecha_caducidad">Fecha Caducidad</label>
            <input v-model="formData.fecha_caducidad" type="text" id="fecha_caducidad" aria-describedby="fecha-caducidad-help">
            <small id="fecha-caducidad-help" class="sr-only">Fecha de caducidad del producto</small>
          </div>
          <div class="form-group">
            <label for="codigo_r">Código R</label>
            <input v-model="formData.codigo_r" type="text" id="codigo_r" aria-describedby="codigo-r-help">
            <small id="codigo-r-help" class="sr-only">Código de identificación R</small>
          </div>
          <div class="form-group">
            <label for="precio_kg">Precio/Kg</label>
            <input v-model="formData.precio_kg" type="text" id="precio_kg" aria-describedby="precio-kg-help">
            <small id="precio-kg-help" class="sr-only">Precio por kilogramo</small>
          </div>
          <div class="form-group">
            <label for="peso_neto">Peso Neto</label>
            <input v-model="formData.peso_neto" type="text" id="peso_neto" aria-describedby="peso-neto-help">
            <small id="peso-neto-help" class="sr-only">Peso neto del producto</small>
          </div>
          <div class="form-group">
            <label for="importe">Importe</label>
            <input v-model="formData.importe" type="text" id="importe" aria-describedby="importe-help">
            <small id="importe-help" class="sr-only">Importe total</small>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" @click="closeModal" class="cancel-button" aria-label="Cancelar y cerrar modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Cancelar
          </button>
          <button type="submit" class="save-button" aria-label="Guardar datos en la base de datos">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Guardar
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  show: Boolean,
  data: Object
})

const emit = defineEmits(['save', 'close'])

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

watch(() => props.data, (newData) => {
  if (newData) {
    formData.value = { ...newData }
  }
}, { immediate: true })

const saveData = () => {
  emit('save', formData.value)
  emit('close')
}

const closeModal = () => {
  emit('close')
}
</script>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.modal-overlay {
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background-color: #ffffff;
  margin: auto;
  padding: 0;
  border-radius: 24px;
  width: 90%;
  max-width: 520px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05);
  animation: slideIn 0.3s ease-out;
  overflow: hidden;
  backdrop-filter: blur(20px);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  padding: 30px 30px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  position: relative;
}

.modal-header::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
}

.modal-header h2 {
  margin: 0;
  text-align: center;
  font-weight: 700;
  font-size: 24px;
}

.edit-form {
  display: flex;
  flex-direction: column;
}

.modal-body {
  padding: 30px;
  max-height: 60vh;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 20px;
  text-align: left;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #2d3748;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-group input {
  width: 100%;
  padding: 16px 18px;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
  box-sizing: border-box;
  font-size: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: #f8fafc;
  font-family: inherit;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  background-color: white;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.12), 0 2px 8px rgba(102, 126, 234, 0.08);
  transform: translateY(-1px);
}

.modal-footer {
  padding: 20px 30px 30px;
  background-color: #f8fafc;
  display: flex;
  gap: 15px;
  border-top: 1px solid #e2e8f0;
}

.cancel-button {
  background-color: #f1f5f9;
  color: #475569;
  border: none;
  padding: 16px 24px;
  border-radius: 12px;
  cursor: pointer;
  flex: 1;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid #e2e8f0;
}

.cancel-button:hover {
  background-color: #e2e8f0;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.save-button {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
  border: none;
  padding: 16px 24px;
  border-radius: 12px;
  cursor: pointer;
  flex: 1;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(72, 187, 120, 0.2);
}

.save-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(72, 187, 120, 0.4);
}

/* Responsive */
@media (max-width: 600px) {
  .modal-content {
    width: 95%;
    margin: 20px;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 20px;
    padding-right: 20px;
  }

  .modal-header {
    padding-top: 25px;
    padding-bottom: 15px;
  }

  .modal-body {
    padding-top: 25px;
    padding-bottom: 25px;
  }

  .modal-footer {
    padding-top: 15px;
    padding-bottom: 25px;
  }

  .modal-header h2 {
    font-size: 20px;
  }

  .form-group input {
    padding: 12px 14px;
    font-size: 16px; /* Prevent zoom on iOS */
  }

  .cancel-button,
  .save-button {
    padding: 12px 20px;
  }
}
</style>