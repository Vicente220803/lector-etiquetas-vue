<template>
  <div class="container">
    <h1>Enviar Foto de Etiqueta</h1>

    <form @submit.prevent="submitForm" class="upload-form">
      <button type="button" @click="toggleCamera" class="take-picture-button">
        {{ showCamera ? 'Cerrar Cámara' : 'Tomar Foto' }}
      </button>

      <label for="fileInput" class="file-label">o Seleccionar Archivo</label>
      <input
        ref="fileInput"
        type="file"
        id="fileInput"
        accept="image/*"
        @change="handleFileChange"
        class="file-input"
      >

      <div class="file-name">{{ fileName }}</div>

      <Camera
        :show-camera="showCamera"
        @image-captured="handleImageCaptured"
        @close-camera="closeCamera"
      />

      <button type="submit" :disabled="isProcessing" class="submit-button">
        {{ isProcessing ? 'Procesando...' : 'Enviar y Analizar' }}
      </button>
    </form>

    <div v-if="isProcessing" class="loader">Cargando...</div>

    <EditModal
      :show="showModal"
      :data="extractedData"
      @save="handleSave"
      @close="closeModal"
    />
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import Camera from './components/Camera.vue'
import EditModal from './components/EditModal.vue'

const webhookUrl = 'https://surexportlevante.app.n8n.cloud/webhook/4efe3070-e61a-4d03-9eef-052ed5508cab'

const fileInput = ref(null)
const showCamera = ref(false)
const fileName = ref('Ningún archivo seleccionado')
const isProcessing = ref(false)
const showModal = ref(false)
const extractedData = ref(null)
let capturedImageFile = null

const toggleCamera = () => {
  if (showCamera.value) {
    closeCamera()
  } else {
    showCamera.value = true
    fileName.value = 'Cámara activa...'
    capturedImageFile = null
    if (fileInput.value) fileInput.value.value = ''
  }
}

const closeCamera = () => {
  showCamera.value = false
  if (!capturedImageFile) {
    fileName.value = 'Ningún archivo seleccionado'
  }
}

const handleImageCaptured = (file) => {
  capturedImageFile = file
  fileName.value = `Imagen capturada: ${file.name}`
  closeCamera()
}

const handleFileChange = () => {
  if (fileInput.value.files.length > 0) {
    fileName.value = fileInput.value.files[0].name
    capturedImageFile = null
    closeCamera()
  } else {
    fileName.value = 'Ningún archivo seleccionado'
  }
}

const submitForm = async () => {
  const fileToSend = capturedImageFile || (fileInput.value.files.length > 0 ? fileInput.value.files[0] : null)

  if (!fileToSend) {
    alert('Por favor, selecciona un archivo o captura una foto.')
    return
  }

  isProcessing.value = true

  const formData = new FormData()
  formData.append('file', fileToSend)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) throw new Error(`Error del servidor: ${response.status} ${response.statusText}`)

    const data = await response.json()
    if (!data) throw new Error('La respuesta de n8n está vacía o no tiene el formato esperado.')

    extractedData.value = data
    showModal.value = true

  } catch (error) {
    alert(`Ha ocurrido un error: ${error.message}`)
  } finally {
    isProcessing.value = false
  }
}

const handleSave = (data) => {
  console.log('Datos a guardar:', data)
  alert('Datos guardados (en consola). ¡Listos para el siguiente paso!')
  resetApp()
}

const closeModal = () => {
  showModal.value = false
  resetApp()
}

const resetApp = () => {
  if (fileInput.value) fileInput.value.value = ''
  capturedImageFile = null
  fileName.value = 'Ningún archivo seleccionado'
  showCamera.value = false
}
</script>

<style scoped>
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #f4f7f9;
  margin: 0;
  padding: 50px 0;
}

.container {
  background-color: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  text-align: center;
  width: 90%;
  max-width: 500px;
}

h1 {
  color: #333;
  margin-bottom: 25px;
}

.upload-form {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.take-picture-button {
  background-color: #17a2b8;
  color: white;
  border: none;
  padding: 14px 28px;
  font-size: 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 10px;
  width: 100%;
}

.file-label {
  background-color: #eef2f5;
  color: #555;
  padding: 12px 20px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-block;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
}

.file-input {
  display: none;
}

.file-name {
  margin-top: 15px;
  font-style: italic;
  color: #777;
}

.submit-button {
  background-color: #007bff;
  color: white;
  border: none;
  padding: 14px 28px;
  font-size: 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 20px;
  width: 100%;
}

.submit-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.loader {
  margin-top: 20px;
  color: #007bff;
}
</style>