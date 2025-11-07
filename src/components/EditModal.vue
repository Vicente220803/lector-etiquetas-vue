<template>
  <div v-if="show" class="modal-overlay" @click="closeModal">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Confirmar Datos</h2>
      </div>
      <form @submit.prevent="saveData" class="edit-form">
        <div class="modal-body">
          <div class="form-group">
            <label for="cliente">Cliente</label>
            <input v-model="formData.cliente" type="text" id="cliente">
          </div>
          <div class="form-group">
            <label for="origen">Origen</label>
            <input v-model="formData.origen" type="text" id="origen">
          </div>
          <div class="form-group">
            <label for="ean">EAN</label>
            <input v-model="formData.ean" type="text" id="ean">
          </div>
          <div class="form-group">
            <label for="lote">Lote</label>
            <input v-model="formData.lote" type="text" id="lote">
          </div>
          <div class="form-group">
            <label for="fecha_envasado">Fecha Envasado</label>
            <input v-model="formData.fecha_envasado" type="text" id="fecha_envasado">
          </div>
          <div class="form-group">
            <label for="fecha_caducidad">Fecha Caducidad</label>
            <input v-model="formData.fecha_caducidad" type="text" id="fecha_caducidad">
          </div>
          <div class="form-group">
            <label for="codigo_r">Código R</label>
            <input v-model="formData.codigo_r" type="text" id="codigo_r">
          </div>
          <div class="form-group">
            <label for="precio_kg">Precio/Kg</label>
            <input v-model="formData.precio_kg" type="text" id="precio_kg">
          </div>
          <div class="form-group">
            <label for="peso_neto">Peso Neto</label>
            <input v-model="formData.peso_neto" type="text" id="peso_neto">
          </div>
          <div class="form-group">
            <label for="importe">Importe</label>
            <input v-model="formData.importe" type="text" id="importe">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" @click="closeModal" class="cancel-button">Cancelar</button>
          <button type="submit" class="save-button">Guardar</button>
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
.modal-overlay {
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background-color: #fefefe;
  margin: auto;
  padding: 25px;
  border: 1px solid #888;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
}

.modal-header {
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.modal-header h2 {
  margin: 0;
  text-align: center;
}

.edit-form {
  display: flex;
  flex-direction: column;
}

.modal-body {
  padding: 20px 0;
}

.form-group {
  margin-bottom: 15px;
  text-align: left;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #ccc;
  box-sizing: border-box;
}

.modal-footer {
  padding-top: 15px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 10px;
}

.cancel-button {
  background-color: #6c757d;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  flex: 1;
}

.save-button {
  background-color: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  flex: 1;
}
</style>