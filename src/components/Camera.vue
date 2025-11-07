<template>
  <div v-if="showCamera" class="camera-container">
    <video ref="video" playsinline autoplay></video>
    <button @click="captureImage" class="capture-button">Capturar Imagen</button>
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
  margin-top: 20px;
}

video {
  width: 100%;
  border-radius: 8px;
}

.capture-button {
  background-color: #28a745;
  color: white;
  border: none;
  padding: 14px 28px;
  font-size: 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 10px;
  width: 100%;
}
</style>