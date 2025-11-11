<template>
  <div v-if="showCamera" class="camera-container">
    <div class="camera-header">
      <h3>Vista Previa de Cámara</h3>
      <button @click="$emit('closeCamera')" class="close-camera-button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    <div class="video-wrapper">
      <video ref="video" playsinline autoplay></video>
      <div class="camera-overlay">
        <div class="capture-guide">
          <div class="guide-frame"></div>
        </div>
      </div>
    </div>
    <div class="camera-controls">
      <button @click="captureImage" class="capture-button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
        Capturar Imagen
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  showCamera: Boolean
})

const emit = defineEmits(['imageCaptured', 'closeCamera'])

const video = ref(null)
let stream = null

const startCamera = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    })
    video.value.srcObject = stream
  } catch (error) {
    console.error('Error al acceder a la cámara:', error)
    alert('No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios.')
  }
}

const stopCamera = () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }
}

const captureImage = () => {
  const canvas = document.createElement('canvas')
  canvas.width = video.value.videoWidth
  canvas.height = video.value.videoHeight
  canvas.getContext('2d').drawImage(video.value, 0, 0, canvas.width, canvas.height)

  canvas.toBlob(blob => {
    const file = new File([blob], 'captura.jpg', { type: 'image/jpeg' })
    emit('imageCaptured', file)
    stopCamera()
  }, 'image/jpeg')
}

onMounted(() => {
  if (props.showCamera) {
    startCamera()
  }
})

onUnmounted(() => {
  stopCamera()
})
</script>

<style scoped>
.camera-container {
  margin-top: 24px;
  background-color: white;
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  animation: cameraSlideIn 0.4s ease-out;
  backdrop-filter: blur(10px);
}

@keyframes cameraSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.camera-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.camera-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-camera-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.close-camera-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.video-wrapper {
  position: relative;
  background-color: white;
  padding: 20px;
}

video {
  width: 100%;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  max-height: 400px;
  object-fit: cover;
}

.camera-overlay {
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  bottom: 20px;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.capture-guide {
  width: 80%;
  height: 60%;
  position: relative;
}

.guide-frame {
  width: 100%;
  height: 100%;
  border: 2px solid rgba(102, 126, 234, 0.6);
  border-radius: 8px;
  position: relative;
}

.guide-frame::before,
.guide-frame::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid #667eea;
  background-color: rgba(255, 255, 255, 0.8);
}

.guide-frame::before {
  top: -2px;
  left: -2px;
  border-bottom: none;
  border-right: none;
  border-radius: 8px 0 0 0;
}

.guide-frame::after {
  bottom: -2px;
  right: -2px;
  border-top: none;
  border-left: none;
  border-radius: 0 0 8px 0;
}

.camera-controls {
  padding: 20px;
  background-color: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.capture-button {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
  border: none;
  padding: 18px 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 14px;
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(72, 187, 120, 0.2);
}

.capture-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 30px rgba(72, 187, 120, 0.4);
}

/* Responsive */
@media (max-width: 600px) {
  .camera-header {
    padding: 15px;
  }

  .camera-header h3 {
    font-size: 16px;
  }

  .video-wrapper {
    padding: 15px;
  }

  video {
    max-height: 300px;
  }

  .camera-controls {
    padding: 15px;
  }

  .capture-button {
    padding: 14px 24px;
    font-size: 15px;
  }
}
</style>