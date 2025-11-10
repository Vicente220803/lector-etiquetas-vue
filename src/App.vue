<template>
  <div class="container">
    <h1>Enviar Foto de Etiqueta</h1>

    <form @submit.prevent="submitForm" class="upload-form">
      <button type="button" @click="toggleCamera" class="take-picture-button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="2"/>
        </svg>
        {{ showCamera ? 'Cerrar Cámara' : 'Tomar Foto' }}
      </button>

      <label for="fileInput" class="file-label">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        o Seleccionar Archivo
      </label>
      <input
        ref="fileInput"
        type="file"
        id="fileInput"
        accept="image/*"
        @change="handleFileChange"
        class="file-input"
      >

      <div v-if="fileName !== 'Ningún archivo seleccionado'" class="file-name">{{ fileName }}</div>

      <div v-if="previewImageUrl" class="image-preview">
        <img :src="previewImageUrl" alt="Imagen capturada" @click="openImageZoom" class="preview-image">
        <button @click="clearImage" class="clear-image-button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div v-if="showCamera" class="camera-section">
        <Camera
          :show-camera="showCamera"
          @image-captured="handleImageCaptured"
          @close-camera="closeCamera"
        />
      </div>

      <!-- Modal de zoom de imagen -->
      <div v-if="showImagePreview" class="image-zoom-modal" @click="closeImageZoom">
        <div class="zoom-modal-content" @click.stop>
          <button @click="closeImageZoom" class="close-zoom-button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <img :src="previewImageUrl" alt="Imagen ampliada" class="zoomed-image">
        </div>
      </div>

      <!-- Modal de éxito -->
      <div v-if="showSuccessModal" class="success-modal" @click="closeSuccessModal">
        <div class="success-modal-content" @click.stop>
          <div class="success-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="#48bb78" stroke="#48bb78" stroke-width="2"/>
              <path d="M8 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3>¡Datos guardados exitosamente!</h3>
          <p>Los datos han sido procesados y guardados correctamente.</p>
          <button @click="closeSuccessModal" class="success-button">Continuar</button>
        </div>
      </div>

      <button type="submit" :disabled="isProcessing" class="submit-button">
        <svg v-if="!isProcessing" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="spinner">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
            <animate attributeName="stroke-dashoffset" dur="1s" repeatCount="indefinite" values="31.416;0"/>
          </circle>
        </svg>
        {{ isProcessing ? 'Procesando...' : 'Enviar y Analizar' }}
      </button>
    </form>

    <div v-if="isProcessing" class="loader">
      <div class="spinner"></div>
      <span>Procesando imagen...</span>
    </div>

    <EditModal
      :show="showModal"
      :data="extractedData"
      @save="handleSave"
      @close="closeModal"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Camera from './components/Camera.vue'
import EditModal from './components/EditModal.vue'
// ---- CAMBIO 1: Importamos el cliente de Supabase ----
import { supabase } from './supabase.js'

const webhookUrl = 'https://surexportlevante.app.n8n.cloud/webhook/4efe3070-e61a-4d03-9eef-052ed5508cab'

const fileInput = ref(null)
const showCamera = ref(false)
const fileName = ref('Ningún archivo seleccionado')
const isProcessing = ref(false)
const showModal = ref(false)
const extractedData = ref(null)
const showImagePreview = ref(false)
const previewImageUrl = ref('')
const showSuccessModal = ref(false)
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
  previewImageUrl.value = URL.createObjectURL(file)
  closeCamera()
}

const handleFileChange = () => {
  if (fileInput.value.files.length > 0) {
    const file = fileInput.value.files[0]
    fileName.value = file.name
    previewImageUrl.value = URL.createObjectURL(file)
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

// ---- CAMBIO 2: Reemplazamos esta función para que guarde en Supabase ----
async function handleSave(data) {
  try {
    isProcessing.value = true // Reutilizamos el estado de carga para el botón de "Guardando..."
    
    // Usamos el cliente de Supabase para insertar los datos
    // que nos llegan desde el modal de edición.
    const { error } = await supabase
      .from('lecturas') // El nombre EXACTO de nuestra tabla
      .insert([ data ]) // 'data' ya tiene el formato correcto { cliente: '...', lote: '...', ... }

    if (error) {
      // Si Supabase devuelve un error, lo mostramos
      throw error
    }

    // Si todo va bien, cerramos el modal de edición y mostramos el modal de éxito
    showModal.value = false
    showSuccessMessage()
    // La app se resetea cuando se cierra el modal de éxito.

  } catch (error) {
    // Mostramos cualquier error que ocurra
    alert('Error al guardar en la base de datos: ' + error.message)
  } finally {
    isProcessing.value = false // Desactivamos el estado de carga
  }
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
  previewImageUrl.value = ''
  showImagePreview.value = false
}

const openImageZoom = () => {
  showImagePreview.value = true
}

const closeImageZoom = () => {
  showImagePreview.value = false
}

const clearImage = () => {
  previewImageUrl.value = ''
  if (fileInput.value) fileInput.value.value = ''
  capturedImageFile = null
  fileName.value = 'Ningún archivo seleccionado'
}

const showSuccessMessage = () => {
  showSuccessModal.value = true
}

const closeSuccessModal = () => {
  showSuccessModal.value = false
  resetApp() // Reseteamos la app después de cerrar el mensaje de éxito.
}
</script>

<style scoped>
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin: 0;
  padding: 50px 20px;
  min-height: 100vh;
}

.container {
  background-color: white;
  padding: 40px;
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  text-align: center;
  width: 100%;
  max-width: 500px;
  position: relative;
  overflow: hidden;
  animation: slideUp 0.6s ease-out;
  margin-bottom: 20px;
}

.camera-section {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #667eea, #764ba2);
}

h1 {
  color: #2d3748;
  margin-bottom: 30px;
  font-weight: 700;
  font-size: 28px;
}

.upload-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.take-picture-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  width: 100%;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.take-picture-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
}

.file-label {
  background-color: #f7fafc;
  color: #4a5568;
  padding: 16px 32px;
  border-radius: 12px;
  cursor: pointer;
  display: inline-block;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  border: 2px dashed #cbd5e0;
  transition: all 0.3s ease;
  font-weight: 500;
}

.file-label:hover {
  background-color: #edf2f7;
  border-color: #667eea;
}

.file-input {
  display: none;
}

.file-name {
  margin-top: 10px;
  font-style: italic;
  color: #718096;
  font-size: 14px;
}

.submit-button {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
  border: none;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  margin-top: 20px;
  width: 100%;
  transition: all 0.3s ease;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(72, 187, 120, 0.3);
}

.submit-button:disabled {
  background: #a0aec0;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.loader {
  margin-top: 20px;
  color: #667eea;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.loader .spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e2e8f0;
  border-top: 2px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.image-preview {
  margin: 20px 0;
  position: relative;
  display: inline-block;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.3s ease;
}

.image-preview:hover {
  transform: scale(1.02);
}

.preview-image {
  width: 100%;
  max-width: 300px;
  height: auto;
  display: block;
  border-radius: 12px;
}

.clear-image-button {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.clear-image-button:hover {
  background: rgba(239, 68, 68, 1);
  transform: scale(1.1);
}

.image-zoom-modal {
  position: fixed;
  z-index: 2000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease-out;
}

.zoom-modal-content {
  position: relative;
  max-width: 90%;
  max-height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-zoom-button {
  position: absolute;
  top: -50px;
  right: 0;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.close-zoom-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.zoomed-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.success-modal {
  position: fixed;
  z-index: 3000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease-out;
}

.success-modal-content {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  margin: auto;
  padding: 40px;
  border-radius: 20px;
  width: 90%;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  animation: slideIn 0.4s ease-out;
  border: 1px solid rgba(72, 187, 120, 0.2);
}

.success-icon {
  margin-bottom: 20px;
  animation: bounceIn 0.6s ease-out;
}

@keyframes bounceIn {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
  }
  70% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.success-modal-content h3 {
  color: #2d3748;
  margin: 0 0 10px 0;
  font-size: 24px;
  font-weight: 700;
}

.success-modal-content p {
  color: #718096;
  margin: 0 0 30px 0;
  font-size: 16px;
  line-height: 1.5;
}

.success-button {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
  border: none;
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(72, 187, 120, 0.3);
}

.success-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(72, 187, 120, 0.4);
}

/* Responsive para modal de éxito */
@media (max-width: 480px) {
  .success-modal-content {
    padding: 30px 20px;
    margin: 20px;
  }

  .success-modal-content h3 {
    font-size: 20px;
  }

  .success-modal-content p {
    font-size: 15px;
  }

  .success-button {
    padding: 12px 24px;
    font-size: 15px;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .camera-section {
    max-width: 100%;
    padding: 0 10px;
  }

  .image-zoom-modal {
    padding: 20px;
  }

  .close-zoom-button {
    top: 10px;
    right: 10px;
  }

  .zoom-modal-content {
    max-width: 95%;
    max-height: 95%;
  }
}

@media (max-width: 600px) {
  body {
    padding: 20px 10px;
  }

  .container {
    padding: 30px 20px;
    margin: 0 10px;
    margin-bottom: 15px;
  }

  .camera-section {
    padding: 0;
  }

  h1 {
    font-size: 24px;
  }

  .upload-form {
    gap: 12px;
  }

  .take-picture-button,
  .file-label,
  .submit-button {
    padding: 14px 24px;
    font-size: 15px;
  }

  .file-name {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .container {
    padding: 25px 15px;
  }

  h1 {
    font-size: 22px;
    margin-bottom: 25px;
  }

  .take-picture-button,
  .file-label,
  .submit-button {
    padding: 12px 20px;
    font-size: 14px;
  }

  .take-picture-button svg,
  .file-label svg,
  .submit-button svg {
    width: 18px;
    height: 18px;
  }

  .preview-image {
    max-width: 250px;
  }

  .close-zoom-button {
    width: 35px;
    height: 35px;
  }

  .close-zoom-button svg {
    width: 20px;
    height: 20px;
  }
}
</style>
