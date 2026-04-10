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
      <p class="camera-tip">Acerca la etiqueta al marco y espera que enfoque</p>
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
      video: {
        facingMode: 'environment',
        width: { ideal: 3840, min: 1280 },
        height: { ideal: 2160, min: 720 },
        focusMode: 'continuous',
        advanced: [{ focusMode: 'continuous' }]
      }
    })
    video.value.srcObject = stream

    // Aplicar enfoque continuo si el dispositivo lo soporta
    const track = stream.getVideoTracks()[0]
    const capabilities = track.getCapabilities?.()
    if (capabilities?.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
    }
  } catch (error) {
    // Fallback a configuración básica si falla la alta resolución
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      video.value.srcObject = stream
    } catch (err) {
      console.error('Error al acceder a la cámara:', err)
      alert('No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios.')
    }
  }
}

const stopCamera = () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }
}

const captureImage = () => {
  if (!video.value || !video.value.videoWidth) {
    console.error('❌ Video no está listo')
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.value.videoWidth
  canvas.height = video.value.videoHeight
  const ctx = canvas.getContext('2d')

  // Dibujar frame del video
  ctx.drawImage(video.value, 0, 0, canvas.width, canvas.height)

  // Mejorar nitidez y contraste para OCR
  ctx.filter = 'contrast(1.2) saturate(1.1) brightness(1.05)'
  ctx.drawImage(canvas, 0, 0)
  ctx.filter = 'none'

  // Aplicar unsharp mask para nitidez
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const sharpened = applySharpen(imageData)
  ctx.putImageData(sharpened, 0, 0)

  // Usar Promise para esperar a que toBlob termine
  canvas.toBlob(
    blob => {
      if (!blob) {
        console.error('❌ Error: blob es null')
        return
      }
      const file = new File([blob], 'captura.jpg', { type: 'image/jpeg' })
      console.log('✅ Imagen capturada:', file.name, file.size, 'bytes')
      emit('imageCaptured', file)
      stopCamera()
    },
    'image/jpeg',
    0.97
  )
}

// Kernel de nitidez (unsharp mask) para mejorar legibilidad OCR
const applySharpen = (imageData) => {
  const d = imageData.data
  const w = imageData.width
  const h = imageData.height
  const result = new ImageData(w, h)
  const rd = result.data
  // Kernel: 0 -1 0 / -1 5 -1 / 0 -1 0
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ni = ((y + ky) * w + (x + kx)) * 4
            sum += d[ni + c] * kernel[(ky + 1) * 3 + (kx + 1)]
          }
        }
        rd[idx + c] = Math.min(255, Math.max(0, sum))
      }
      rd[idx + 3] = d[idx + 3]
    }
  }
  return result
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
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: black;
}

.camera-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
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
}

.video-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-overlay {
  position: absolute;
  inset: 0;
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
  padding: 16px 20px;
  background-color: rgba(0, 0, 0, 0.85);
  flex-shrink: 0;
}

.camera-tip {
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  text-align: center;
  margin: 0 0 10px;
}

.capture-button {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
  color: white;
  border: none;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 14px;
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-shadow: 0 4px 15px rgba(72, 187, 120, 0.3);
}
</style>