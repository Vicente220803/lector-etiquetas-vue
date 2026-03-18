<template>
  <div class="app">
    <!-- HEADER -->
    <header class="app-header">
      <div class="header-title">
        <h1>CONTROL ETIQUETADO IV GAMA</h1>
        <p class="subtitle">un registro para cada producto y fecha de caducidad al inicio de la fabricación</p>
      </div>
      <div class="header-date">
        {{ fechaHoyFormato }} ({{ diaJuliano }})
      </div>
    </header>

    <!-- MAIN FORM -->
    <div class="form-panel">
      <!-- ROW 1: Responsable, Producto, P+X, Fecha Envasado -->
      <div class="form-row row-4col">
        <div class="field-group">
          <label class="field-label">RESPONSABLE</label>
          <select v-model="responsable" class="field-input field-select" :class="{ 'field-placeholder': !responsable }">
            <option value="" disabled>Responsable</option>
            <option v-for="r in listaResponsables" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>

        <div class="field-group">
          <label class="field-label">PRODUCTO</label>
          <input v-model="producto" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <div class="field-group field-small">
          <label class="field-label">P+X</label>
          <input
            v-model.number="px_usuario"
            type="number"
            class="field-input field-px"
            placeholder="?"
            min="0"
            max="30"
          >
        </div>

        <div class="field-group">
          <label class="field-label">FECHA ENVASADO</label>
          <input v-model="formData.fecha_envasado" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>
      </div>

      <!-- ROW 2: Lectura código, Lote, Imagen -->
      <div class="form-row row-3col">
        <div class="field-group">
          <label class="field-label">LECTURA CÓDIGO DE BARRAS</label>
          <input
            ref="eanInput"
            v-model="eanEscaneado"
            type="text"
            class="field-input"
            :class="{ 'field-scan-active': datosExtraidos && !eanEscaneado }"
            placeholder="Lectura etiqueta"
            @keydown.enter.prevent="validarEan"
          >
          <div v-if="eanEscaneado && formData.ean" class="ean-feedback" :class="eanCoincide ? 'ean-ok' : 'ean-error'">
            {{ eanCoincide ? '✓ EAN coincide' : '✗ EAN NO coincide' }}
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">LOTE</label>
          <input v-model="formData.lote" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <!-- Image slot 1: captured photo -->
        <div class="image-slot" @click="toggleCamera" tabindex="0" @keydown.enter="toggleCamera">
          <img v-if="previewImageUrl" :src="previewImageUrl" alt="Foto etiqueta" class="image-thumb">
          <div v-else class="image-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#9ca3af" stroke-width="1.5"/><circle cx="12" cy="13" r="4" stroke="#9ca3af" stroke-width="1.5"/></svg>
            <span>Pulsar para agregar una imagen</span>
          </div>
        </div>

      </div>

      <!-- ROW 3: Todos los campos OCR -->
      <div class="form-row row-3col">
        <div class="field-group">
          <label class="field-label">CLIENTE</label>
          <input v-model="formData.cliente" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <div class="field-group">
          <label class="field-label">PRODUCTO</label>
          <input v-model="formData.producto_db" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <div class="field-group">
          <label class="field-label">ORIGEN</label>
          <input v-model="formData.origen" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>
      </div>

      <div class="form-row row-3col">
        <div class="field-group">
          <label class="field-label">EAN</label>
          <input v-model="formData.ean" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <div class="field-group">
          <label class="field-label">CÓDIGO R</label>
          <input v-model="formData.codigo_r" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <div class="field-group">
          <label class="field-label">FECHA CADUCIDAD</label>
          <input v-model="formData.fecha_caducidad" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>
      </div>

      <div class="form-row row-3col">
        <div class="field-group">
          <label class="field-label">PRECIO/KG</label>
          <input v-model="formData.precio_kg" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <div class="field-group">
          <label class="field-label">PESO NETO</label>
          <input v-model="formData.peso_neto" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>

        <div class="field-group">
          <label class="field-label">IMPORTE</label>
          <input v-model="formData.importe" type="text" class="field-input field-readonly" readonly placeholder="—">
        </div>
      </div>


      <!-- Hidden file input -->
      <input ref="fileInput" type="file" accept="image/*" @change="handleFileChange" class="hidden-input">


      <!-- Processing overlay -->
      <div v-if="isProcessing" class="processing-overlay">
        <div class="processing-spinner"></div>
        <span>Procesando imagen...</span>
        <div class="progress-bar"><div class="progress-fill"></div></div>
      </div>
    </div>

    <!-- BOTTOM: Summary + Actions -->
    <div class="bottom-bar">
      <!-- Last saved entry summary -->
      <div v-if="ultimoRegistro" class="summary-card">
        <div class="summary-info">
          <div class="summary-row">
            <div><strong class="summary-heading">PRODUCTO</strong><br>{{ ultimoRegistro.producto }}</div>
            <div><strong class="summary-heading">P+X</strong><br>{{ ultimoRegistro.px }}</div>
          </div>
          <div class="summary-row">
            <div><strong class="summary-heading">ENVASADO</strong><br>{{ ultimoRegistro.fecha }}</div>
            <div><strong class="summary-heading">RESPONSABLE</strong><br>{{ ultimoRegistro.responsable }}</div>
            <div><strong class="summary-heading">ID REGISTRO</strong><br>{{ ultimoRegistro.id }}</div>
          </div>
        </div>
        <div class="summary-thumb" v-if="ultimoRegistro.imagen">
          <img :src="ultimoRegistro.imagen" alt="Última foto">
        </div>
      </div>

      <!-- Action buttons -->
      <div class="action-buttons">
        <button class="btn-reload" @click="resetApp" aria-label="Nuevo registro">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="#1a365d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="#1a365d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>

        <button
          class="btn-guardar"
          :disabled="!puedeGuardar || isProcessing"
          @click="guardarRegistro"
        >
          GUARDAR
        </button>
      </div>
    </div>

    <!-- MODALS -->
    <!-- Camera modal -->
    <div v-if="showCamera" class="camera-modal">
      <Camera
        :show-camera="showCamera"
        @image-captured="handleImageCaptured"
        @close-camera="closeCamera"
      />
    </div>

    <!-- Image zoom -->
    <div v-if="showImagePreview" class="modal-overlay" @click="showImagePreview = false">
      <div class="zoom-content" @click.stop>
        <button @click="showImagePreview = false" class="close-btn">&times;</button>
        <img :src="previewImageUrl" alt="Imagen ampliada" class="zoomed-img">
      </div>
    </div>

    <!-- Success modal -->
    <div v-if="showSuccessModal" class="modal-overlay" @click="closeSuccessModal">
      <div class="success-content" @click.stop>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#48bb78"/><path d="M8 12l2 2 4-4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3>¡Datos guardados exitosamente!</h3>
        <p>Los datos han sido procesados y guardados correctamente.</p>
        <button @click="closeSuccessModal" class="btn-continuar">Continuar</button>
      </div>
    </div>

    <!-- P+X validation alert -->
    <div v-if="showPxAlert" class="modal-overlay" @click="showPxAlert = false">
      <div class="alert-content" @click.stop>
        <div class="alert-icon">⚠️</div>
        <h3>{{ pxAlertTitle }}</h3>
        <p>{{ pxAlertMessage }}</p>
        <button @click="showPxAlert = false" class="btn-continuar">Entendido</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Camera from './components/Camera.vue'
import { supabase } from './supabase.js'

const webhookUrl = 'https://surexportlevante.app.n8n.cloud/webhook/4efe3070-e61a-4d03-9eef-052ed5508cab'

// --- MODO REAL ACTIVADO ---
const isSimulationMode = ref(false)

// --- UI STATE ---
const fileInput = ref(null)
const eanInput = ref(null)
const showCamera = ref(false)
const isProcessing = ref(false)
const showImagePreview = ref(false)
const previewImageUrl = ref('')
const showSuccessModal = ref(false)
const isCapturingImage = ref(false)
const showPxAlert = ref(false)
const pxAlertTitle = ref('')
const pxAlertMessage = ref('')
let capturedImageFile = null
const fileToUpload = ref(null)
const imageCache = new Map()
const datosExtraidos = ref(false)

// --- FORM FIELDS ---
const responsable = ref('')
const producto = ref('')
const px_usuario = ref(null)
const eanEscaneado = ref('')
function fechaHoyStr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const formData = ref({
  cliente: '',
  producto_db: '',
  origen: '',
  ean: '',
  lote: '',
  fecha_envasado: fechaHoyStr(),
  fecha_caducidad: '',
  codigo_r: '',
  precio_kg: '',
  peso_neto: '',
  importe: ''
})

// Validation data from n8n
const validacionPx = ref(null)

// Last saved entry
const ultimoRegistro = ref(null)

// --- LISTS (Responsable names - placeholder, user will provide) ---
const listaResponsables = ref(['Aurora', 'Carlos', 'María', 'Pedro', 'Laura'])

// --- COMPUTED ---
const fechaHoy = new Date()
const fechaHoyFormato = computed(() => {
  const d = fechaHoy
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
})

const diaJuliano = computed(() => {
  const d = new Date()
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d - start
  return Math.floor(diff / 86400000)
})


const eanCoincide = computed(() => {
  if (!eanEscaneado.value || !formData.value.ean) return null
  return formData.value.ean.trim() === eanEscaneado.value.trim()
})

// P+X validation ranges
const pxRangosPorCliente = {
  'LIDL': { min: 8, max: 9 },
  'ALDI': { min: 8, max: 9 },
  'DELMONTE': { min: 8, max: 9 },
  'MERCADONA SA': { min: 5, max: 5 },
  'Maskom': { min: 8, max: 9 }
}

const esPxCorrecto = computed(() => {
  if (!validacionPx.value) return px_usuario.value !== null && px_usuario.value !== ''
  const pxValue = Number(px_usuario.value)
  const pxLeido = Number(validacionPx.value.px_leido)
  const cliente = formData.value.cliente
  const rango = pxRangosPorCliente[cliente]

  if (pxValue !== pxLeido) return false
  if (!rango) return true
  return pxValue >= rango.min && pxValue <= rango.max
})

const estadoGeneral = computed(() => {
  if (validacionPx.value && !esPxCorrecto.value && px_usuario.value !== null && px_usuario.value !== '') return 'KO'
  if (eanEscaneado.value && eanCoincide.value === false) return 'KO'
  return 'OK'
})

const puedeGuardar = computed(() => {
  if (!responsable.value) return false
  if (!producto.value && !formData.value.producto_db) return false
  if (px_usuario.value === null || px_usuario.value === '') return false
  if (datosExtraidos.value && !eanEscaneado.value) return false
  if (datosExtraidos.value && eanCoincide.value === false) return false
  // Bloquear si P+X es incorrecto
  if (estadoGeneral.value === 'KO') return false
  // Campos obligatorios tras OCR
  if (datosExtraidos.value) {
    if (!formData.value.lote) return false
    if (!formData.value.ean) return false
    if (!formData.value.fecha_caducidad) return false
    if (!formData.value.cliente) return false
  }
  return true
})

// --- CAMERA / FILE ---
const toggleCamera = () => {
  if (showCamera.value) {
    closeCamera()
  } else {
    showCamera.value = true
    capturedImageFile = null
    fileToUpload.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
}

const closeCamera = () => {
  showCamera.value = false
}

const handleImageCaptured = (file) => {
  isCapturingImage.value = true
  capturedImageFile = file
  fileToUpload.value = file

  const cacheKey = file.name + file.size
  if (imageCache.has(cacheKey)) {
    previewImageUrl.value = imageCache.get(cacheKey)
  } else {
    const url = URL.createObjectURL(file)
    previewImageUrl.value = url
    imageCache.set(cacheKey, url)
  }

  setTimeout(() => {
    isCapturingImage.value = false
  }, 500)

  closeCamera()
  enviarAOCR(file)
}

const handleFileChange = () => {
  if (fileInput.value.files.length > 0) {
    const file = fileInput.value.files[0]

    if (!file.type.startsWith('image/')) {
      showError('Por favor, selecciona un archivo de imagen válido.')
      fileInput.value.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      showError('El archivo es demasiado grande. Máximo 10MB permitido.')
      fileInput.value.value = ''
      return
    }

    fileToUpload.value = file

    const cacheKey = file.name + file.size
    if (imageCache.has(cacheKey)) {
      previewImageUrl.value = imageCache.get(cacheKey)
    } else {
      const url = URL.createObjectURL(file)
      previewImageUrl.value = url
      imageCache.set(cacheKey, url)
    }

    capturedImageFile = null
    closeCamera()
    enviarAOCR(file)
  }
}

// --- OCR: Send image to n8n ---
const enviarAOCR = async (file) => {
  isProcessing.value = true

  if (isSimulationMode.value) {
    setTimeout(() => {
      const data = {
        cliente: "LIDL",
        producto_db: "Coco bolsa Gufresco",
        origen: "ESPAÑA",
        ean: "2299810123456",
        lote: "L-77",
        fecha_envasado: "18/03/2026",
        fecha_caducidad: "28/03/2026",
        codigo_r: "R123",
        precio_kg: "2.50",
        peso_neto: "500g",
        importe: "1.25",
        validacion_px: {
          px_esperado: 10,
          px_leido: 10,
          dia_semana_nombre: "MIÉRCOLES",
          diferencia: 0
        }
      }
      aplicarDatosOCR(data)
      isProcessing.value = false
    }, 1500)
    return
  }

  const formDataSend = new FormData()
  formDataSend.append('file', file)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formDataSend,
    })

    if (!response.ok) throw new Error(`Error del servidor: ${response.status} ${response.statusText}`)

    const data = await response.json()
    if (!data) throw new Error('La respuesta de n8n está vacía.')

    aplicarDatosOCR(data)
  } catch (error) {
    showError(`Error OCR: ${error.message}`)
  } finally {
    isProcessing.value = false
  }
}

const aplicarDatosOCR = (data) => {
  formData.value = {
    cliente: data.cliente || '',
    producto_db: data.producto_db || '',
    origen: data.origen || '',
    ean: data.ean || '',
    lote: data.lote || '',
    fecha_envasado: data.fecha_envasado || '',
    fecha_caducidad: data.fecha_caducidad || '',
    codigo_r: data.codigo_r || '',
    precio_kg: data.precio_kg || '',
    peso_neto: data.peso_neto || '',
    importe: data.importe || ''
  }

  if (data.validacion_px) {
    validacionPx.value = data.validacion_px
  }

  if (data.producto_db) {
    producto.value = data.producto_db
  }

  datosExtraidos.value = true
}

// --- P+X Validation ---
watch(px_usuario, (val) => {
  if (val === null || val === '' || !validacionPx.value) return
  const pxValue = Number(val)
  const pxLeido = Number(validacionPx.value.px_leido)
  const cliente = formData.value.cliente
  const rango = pxRangosPorCliente[cliente]

  if (pxValue !== pxLeido) {
    pxAlertTitle.value = '❌ P+X NO COINCIDE'
    pxAlertMessage.value = `La etiqueta marca P+${pxLeido}, pero has ingresado P+${pxValue}. Deben coincidir.`
    showPxAlert.value = true
  } else if (rango && (pxValue < rango.min || pxValue > rango.max)) {
    pxAlertTitle.value = '⚠️ P+X FUERA DE RANGO'
    pxAlertMessage.value = `P+${pxValue} está fuera del rango aceptable para ${cliente} (${rango.min}-${rango.max}).`
    showPxAlert.value = true
  }
})

const validarEan = () => {
  // Just mark as validated on Enter
}

// --- SAVE ---
function normalizarFecha(fechaStr) {
  if (!fechaStr) return ''
  const limpia = fechaStr.trim()
  let dia, mes, ano

  if (limpia.includes('/')) {
    const partes = limpia.split('/')
    if (partes.length === 3) {
      dia = partes[0].padStart(2, '0')
      mes = partes[1].padStart(2, '0')
      ano = partes[2].length === 4 ? partes[2].slice(-2) : partes[2]
      return `${dia}.${mes}.${ano}`
    }
  }

  if (limpia.includes('.')) {
    const partes = limpia.split('.')
    if (partes.length === 3) {
      dia = partes[0].padStart(2, '0')
      mes = partes[1].padStart(2, '0')
      ano = partes[2].length === 4 ? partes[2].slice(-2) : partes[2]
      return `${dia}.${mes}.${ano}`
    }
  }

  return limpia
}

async function enviarWebhookConReintentos(formDataSend, maxReintentos = 2) {
  const webhookUrlFinal = 'https://surexportlevante.app.n8n.cloud/webhook/guardar-etiqueta'
  let ultimoError = null

  for (let intento = 1; intento <= maxReintentos; intento++) {
    try {
      const response = await fetch(webhookUrlFinal, {
        method: 'POST',
        body: formDataSend
      })

      if (!response.ok) {
        const errorText = await response.text()
        ultimoError = `Error ${response.status}: ${errorText}`

        if (response.status === 500) {
          throw new Error('n8n no pudo analizar la imagen. Comprueba que la etiqueta sea legible y bien orientada.')
        }

        if (intento < maxReintentos) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }
        throw new Error(ultimoError)
      }

      const responseData = await response.json()
      return responseData

    } catch (error) {
      ultimoError = error.message
      if (intento < maxReintentos) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  }

  throw new Error(`Webhook falló después de ${maxReintentos} intentos. ${ultimoError}`)
}

async function registrarEnAuditoria(data, estado, detalles = null) {
  try {
    const auditLog = {
      timestamp: new Date().toISOString(),
      cliente: data.cliente,
      ean: data.ean,
      px_usuario: data.px_usuario,
      estado: estado,
      detalles: detalles,
      navegador: navigator.userAgent.substring(0, 100)
    }

    const { error } = await supabase
      .from('audit_logs')
      .insert([auditLog])

    if (error) {
      console.warn('No se pudo registrar en auditoría:', error)
    }
  } catch (error) {
    console.warn('Error al registrar auditoría:', error)
  }
}

const guardarRegistro = async () => {
  if (!puedeGuardar.value) return

  isProcessing.value = true

  try {
    if (!fileToUpload.value) {
      throw new Error("No se encontró la imagen para subir. Por favor, selecciona la imagen de nuevo.")
    }

    const fd = new FormData()
    fd.append('cliente', formData.value.cliente || '')
    fd.append('producto_db', producto.value || formData.value.producto_db || '')
    fd.append('origen', formData.value.origen || '')
    fd.append('ean', formData.value.ean || '')
    fd.append('lote', formData.value.lote || '')
    fd.append('codigo_r', formData.value.codigo_r || '')
    fd.append('fecha_envasado', normalizarFecha(formData.value.fecha_envasado))
    fd.append('fecha_caducidad', normalizarFecha(formData.value.fecha_caducidad))
    fd.append('precio_kg', formData.value.precio_kg || '')
    fd.append('peso_neto', formData.value.peso_neto || '')
    fd.append('importe', formData.value.importe || '')
    fd.append('px_usuario', px_usuario.value || '')
    fd.append('responsable', responsable.value || '')
    fd.append('file', fileToUpload.value)

    const responseData = await enviarWebhookConReintentos(fd, 2)

    await registrarEnAuditoria({
      cliente: formData.value.cliente,
      ean: formData.value.ean,
      px_usuario: px_usuario.value
    }, 'GUARDADA', { webhook_exitoso: true })

    // Save as last entry
    ultimoRegistro.value = {
      producto: producto.value || formData.value.producto_db,
      px: px_usuario.value,
      fecha: formData.value.fecha_envasado,
      responsable: responsable.value,
      id: responseData?.id || Math.floor(Math.random() * 9999),
      imagen: previewImageUrl.value
    }

    showSuccessModal.value = true

  } catch (error) {
    const msg = error.message

    await registrarEnAuditoria({
      cliente: formData.value.cliente,
      ean: formData.value.ean,
      px_usuario: px_usuario.value
    }, 'ERROR', {
      mensaje: msg,
      tipo: msg.includes('n8n') ? 'ERROR_N8N' : 'ERROR_WEBHOOK'
    })

    if (msg.includes('n8n no pudo analizar')) {
      showError('n8n no pudo procesar la imagen. Comprueba que la etiqueta sea clara y legible.')
    } else if (msg.includes('después de 2 intentos')) {
      showError('Error de conexión. Se reintentó 2 veces sin éxito.')
    } else {
      showError(msg)
    }
  } finally {
    isProcessing.value = false
  }
}

// --- RESET ---
const resetApp = () => {
  if (fileInput.value) fileInput.value.value = ''
  capturedImageFile = null
  fileToUpload.value = null
  showCamera.value = false

  if (previewImageUrl.value) URL.revokeObjectURL(previewImageUrl.value)
  previewImageUrl.value = ''
  showImagePreview.value = false

  formData.value = {
    cliente: '', producto_db: '', origen: '', ean: '', lote: '',
    fecha_envasado: fechaHoyStr(), fecha_caducidad: '', codigo_r: '',
    precio_kg: '', peso_neto: '', importe: ''
  }
  validacionPx.value = null
  px_usuario.value = null
  eanEscaneado.value = ''
  producto.value = ''
  datosExtraidos.value = false

  if (imageCache.size > 10) imageCache.clear()
}

const closeSuccessModal = () => {
  showSuccessModal.value = false
  resetApp()
}

const showError = (message) => {
  const toast = document.createElement('div')
  toast.className = 'error-toast'
  toast.innerHTML = `<div class="error-content"><span>${message}</span></div>`
  document.body.appendChild(toast)
  setTimeout(() => toast.classList.add('show'), 10)
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => document.body.removeChild(toast), 300)
  }, 5000)
}
</script>

<style scoped>
/* ========== HEADER ========== */
.app-header {
  background: linear-gradient(135deg, #8fa4bd 0%, #a8bad0 50%, #c5d0dc 100%);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 3px solid #6b83a0;
}

.back-btn {
  background: rgba(255,255,255,0.25);
  border: none;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}
.back-btn:hover { background: rgba(255,255,255,0.4); }

.header-title { flex: 1; }
.header-title h1 {
  font-size: 24px;
  font-weight: 900;
  color: #1a202c;
  letter-spacing: 0.5px;
  margin: 0;
}
.subtitle {
  font-size: 12px;
  color: #4a5568;
  font-style: italic;
  margin: 2px 0 0 0;
}

.header-date {
  background: #fef9c3;
  border: 2px solid #d4a017;
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: 700;
  font-size: 16px;
  color: #1a202c;
  white-space: nowrap;
}

/* ========== FORM PANEL ========== */
.form-panel {
  background: #d5dfe9;
  padding: 16px;
  position: relative;
}

.form-row {
  display: grid;
  gap: 12px;
  margin-bottom: 12px;
}

.row-4col {
  grid-template-columns: 1fr 1.5fr 0.5fr 1fr;
}

.row-3col {
  grid-template-columns: 1fr 1fr 1fr;
}

.field-group {
  display: flex;
  flex-direction: column;
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  color: #1a365d;
  text-transform: uppercase;
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}

.field-input {
  padding: 12px 14px;
  border: 2px solid #1a365d;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #1a202c;
  background: white;
  transition: all 0.2s;
  width: 100%;
  box-sizing: border-box;
}

.field-input:focus {
  outline: none;
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.15);
}

.field-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%231a365d' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
  cursor: pointer;
}

.field-placeholder { color: #a0aec0; }

.field-readonly {
  background: #edf2f7;
  color: #4a5568;
  cursor: default;
}

.field-px {
  text-align: center;
  font-size: 22px;
  font-weight: 800;
  color: #1a365d;
}

.field-scan-active {
  border-color: #d69e2e;
  border-width: 3px;
  background: #fffbeb;
  animation: scanPulse 1.5s ease-in-out infinite;
}

@keyframes scanPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(214, 158, 46, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(214, 158, 46, 0.1); }
}

.date-input-wrapper {
  position: relative;
}
.date-icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

/* ========== IMAGE SLOTS ========== */
.image-slot {
  border: 2px solid #1a365d;
  border-radius: 8px;
  background: #f7fafc;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}
.image-slot:hover {
  background: #edf2f7;
  border-color: #3182ce;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #9ca3af;
  font-size: 11px;
  text-align: center;
  padding: 10px;
}

.image-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  max-height: 140px;
}

/* ========== EAN FEEDBACK ========== */
.ean-feedback {
  margin-top: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}
.ean-ok { background: #c6f6d5; color: #22543d; }
.ean-error { background: #fed7d7; color: #9b2c2c; }

/* ========== STATUS BADGE ========== */
.status-badge {
  display: inline-block;
  margin: 8px 0;
  padding: 6px 16px;
  border-radius: 6px;
  font-weight: 800;
  font-size: 18px;
  letter-spacing: 1px;
}
.badge-ok { background: #c6f6d5; color: #22543d; }
.badge-ko { background: #fed7d7; color: #9b2c2c; }

/* ========== CAMERA ========== */
.camera-modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: black;
}

/* ========== PROCESSING ========== */
.processing-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 10;
  border-radius: 0;
}

.processing-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid #e2e8f0;
  border-top-color: #3182ce;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-bar {
  width: 200px;
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3182ce, #5a67d8);
  border-radius: 2px;
  animation: progress 2s ease-in-out infinite;
}
@keyframes progress {
  0% { width: 0%; }
  50% { width: 70%; }
  100% { width: 100%; }
}

/* ========== BOTTOM BAR ========== */
.bottom-bar {
  background: linear-gradient(135deg, #8fa4bd 0%, #a8bad0 100%);
  padding: 14px 20px;
  display: flex;
  align-items: stretch;
  gap: 16px;
}

/* Summary card */
.summary-card {
  flex: 1;
  background: #e8f5e9;
  border: 2px solid #66bb6a;
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  font-size: 12px;
}
.summary-info { flex: 1; }
.summary-heading {
  font-size: 10px;
  font-weight: 800;
  color: #2e7d32;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.summary-row {
  display: flex;
  gap: 16px;
  margin-bottom: 6px;
}
.summary-badges { margin-bottom: 6px; }

.badge-row {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.mini-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.mini-ok { background: #48bb78; color: white; }
.mini-na { background: #cbd5e0; color: #718096; }

.summary-thumb {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}
.summary-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Action buttons */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.btn-reload {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 2px solid #1a365d;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-reload:hover {
  background: #edf2f7;
  transform: rotate(180deg);
}

.btn-guardar {
  background: #1a365d;
  color: white;
  border: none;
  padding: 16px 48px;
  font-size: 20px;
  font-weight: 800;
  border-radius: 12px;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(26, 54, 93, 0.3);
}
.btn-guardar:hover:not(:disabled) {
  background: #2a4a7f;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(26, 54, 93, 0.4);
}
.btn-guardar:disabled {
  background: #a0aec0;
  cursor: not-allowed;
  box-shadow: none;
}

/* ========== MODALS ========== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
}

.zoom-content {
  position: relative;
  max-width: 90%;
  max-height: 90%;
}
.zoomed-img {
  max-width: 100%;
  max-height: 85vh;
  border-radius: 8px;
}
.close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  background: rgba(255,255,255,0.2);
  color: white;
  border: none;
  font-size: 32px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.success-content, .alert-content {
  background: white;
  border-radius: 20px;
  padding: 36px;
  text-align: center;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 50px rgba(0,0,0,0.25);
}
.success-content h3, .alert-content h3 {
  margin: 16px 0 8px;
  font-size: 20px;
  color: #1a202c;
}
.success-content p, .alert-content p {
  color: #718096;
  margin-bottom: 24px;
  font-size: 14px;
}
.alert-icon {
  font-size: 48px;
}
.btn-continuar {
  background: #1a365d;
  color: white;
  border: none;
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-continuar:hover {
  background: #2a4a7f;
}

/* ========== HIDDEN ========== */
.hidden-input { display: none; }

/* ========== ERROR TOAST (global) ========== */
:global(.error-toast) {
  position: fixed;
  top: 20px;
  right: 20px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  padding: 14px 18px;
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.3);
  z-index: 10000;
  transform: translateX(120%);
  transition: transform 0.3s ease;
  max-width: 400px;
  font-size: 14px;
}
:global(.error-toast.show) {
  transform: translateX(0);
}
:global(.error-content) {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ========== RESPONSIVE ========== */
@media (max-width: 900px) {
  .row-4col { grid-template-columns: 1fr 1fr; }
  .row-3col { grid-template-columns: 1fr 1fr; }

  .header-title h1 { font-size: 18px; }
  .header-date { font-size: 13px; padding: 6px 10px; }
}

@media (max-width: 600px) {
  .app-header {
    padding: 10px 12px;
    gap: 8px;
  }
  .header-title h1 { font-size: 15px; }
  .subtitle { font-size: 10px; }
  .header-date { font-size: 11px; padding: 4px 8px; }
  .back-btn { width: 36px; height: 36px; }

  .form-panel { padding: 10px; }
  .row-4col, .row-3col {
    grid-template-columns: 1fr 1fr;
  }

  .field-input { padding: 10px; font-size: 14px; }
  .field-px { font-size: 18px; }
  .field-label { font-size: 10px; }

  .bottom-bar {
    flex-direction: column;
    padding: 12px;
  }

  .btn-guardar {
    width: 100%;
    padding: 14px;
    font-size: 18px;
  }

  .action-buttons {
    flex-direction: row;
    justify-content: center;
  }

}

/* TABLET LANDSCAPE */
@media (max-height: 600px) and (min-width: 768px) {
  .form-panel { padding: 10px 14px; }
  .form-row { gap: 8px; margin-bottom: 8px; }
  .field-input { padding: 8px 10px; font-size: 14px; }
  .image-slot { min-height: 90px; }
  .bottom-bar { padding: 10px 16px; }
  .btn-guardar { padding: 12px 36px; font-size: 16px; }
}
</style>
