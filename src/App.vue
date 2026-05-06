<template>
  <div class="app">
    <!-- ============ MODO VERIFICACIÓN (iframe desde Hoja de Fabricación) ============ -->
    <div v-if="verifyMode" class="verify-screen">
      <div class="verify-card">
        <div class="verify-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" stroke="#1a365d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h2 class="verify-title">VERIFICAR ETIQUETA</h2>
        <p class="verify-subtitle">Modo verificación activado</p>
        <div class="verify-info">
          <div><b>Cliente esperado:</b> {{ verifyParams?.cliente || '—' }}</div>
          <div><b>P+X esperado:</b> {{ verifyParams?.px ?? '—' }}</div>
          <div><b>Producto:</b> {{ verifyParams?.modoProducto === 'coco' ? '🥥 Coco' : '🍍 Piña' }}</div>
          <div><b>ID Orden:</b> {{ verifyParams?.orderId || '—' }}</div>
        </div>
        <p class="verify-hint">⏳ La cámara se abrirá automáticamente (próximo paso)</p>
      </div>
    </div>

    <!-- ============ MODO NORMAL (turno + análisis manual) ============ -->
    <template v-else>
    <!-- PANTALLA INICIO TURNO (cuando no hay turno activo) -->
    <div v-if="!turnoActivo" class="turno-screen">
      <div class="turno-card">
        <div class="turno-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#1a365d" stroke-width="2"/><path d="M12 6v6l4 2" stroke="#1a365d" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h2 class="turno-title">CONTROL ETIQUETADO IV GAMA</h2>
        <p class="turno-subtitle">Selecciona el responsable e inicia el turno para comenzar a analizar etiquetas</p>
        <div class="turno-fecha">{{ fechaHoyFormato }} ({{ diaJuliano }})</div>
        <div class="turno-field">
          <label class="field-label">RESPONSABLE DEL TURNO</label>
          <select v-model="responsableTurno" class="field-input field-select turno-select" :class="{ 'field-placeholder': !responsableTurno }">
            <option value="" disabled>Seleccionar responsable</option>
            <option v-for="r in listaResponsables" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
        <button
          class="btn-iniciar-turno"
          :disabled="!responsableTurno"
          @click="showConfirmIniciar = true"
        >
          INICIAR TURNO
        </button>
      </div>
    </div>

    <!-- CONTENIDO PRINCIPAL (solo cuando hay turno activo) -->
    <template v-else>
    <!-- HEADER -->
    <header class="app-header">
      <div class="header-title">
        <h1>CONTROL ETIQUETADO IV GAMA</h1>
        <p class="subtitle">Turno iniciado por <strong>{{ responsableTurno }}</strong> a las {{ turnoInicioHora }}</p>
      </div>
      <div class="header-actions">
        <div class="header-date">
          {{ fechaHoyFormato }} ({{ diaJuliano }})
        </div>
        <div class="modo-toggle">
          <button
            class="modo-btn"
            :class="{ 'modo-btn-active modo-pina': modoProducto === 'pina' }"
            @click="modoProducto = 'pina'"
            type="button"
          >
            🍍 PIÑA
          </button>
          <button
            class="modo-btn"
            :class="{ 'modo-btn-active modo-coco': modoProducto === 'coco' }"
            @click="modoProducto = 'coco'"
            type="button"
          >
            🥥 COCO
          </button>
        </div>
        <button class="btn-finalizar-turno-header" @click="showConfirmFinalizar = true">
          FINALIZAR TURNO ({{ registrosTurno.length }})
        </button>
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
        <div class="image-slot-wrapper">
          <div class="image-slot" @click="toggleCamera" tabindex="0" @keydown.enter="toggleCamera">
            <img v-if="previewImageUrl" :src="previewImageUrl" alt="Foto etiqueta" class="image-thumb">
            <div v-else class="image-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#9ca3af" stroke-width="1.5"/><circle cx="12" cy="13" r="4" stroke="#9ca3af" stroke-width="1.5"/></svg>
              <span>Pulsar para agregar una imagen</span>
            </div>
          </div>
          <button class="btn-galeria" @click="fileInput.click()" type="button">📁 Galería</button>
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

      <template v-if="modoProducto !== 'coco'">
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
      </template>

      <template v-else>
        <div class="form-row row-3col">
          <div class="field-group">
            <label class="field-label">EAN</label>
            <input v-model="formData.ean" type="text" class="field-input field-readonly" readonly placeholder="—">
          </div>

          <div class="field-group">
            <label class="field-label">FECHA CADUCIDAD</label>
            <input v-model="formData.fecha_caducidad" type="text" class="field-input field-readonly" readonly placeholder="—">
          </div>

          <div class="field-group">
            <label class="field-label">PESO NETO</label>
            <input v-model="formData.peso_neto" type="text" class="field-input field-readonly" readonly placeholder="—">
          </div>
        </div>
      </template>


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

    </template><!-- fin v-else turno activo -->

    <!-- Modal confirmar INICIAR turno -->
    <div v-if="showConfirmIniciar" class="modal-overlay">
      <div class="confirm-content" @click.stop>
        <div class="confirm-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2b6cb0" stroke-width="2"/><path d="M12 8v4M12 16h.01" stroke="#2b6cb0" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h3>Vas a iniciar el turno</h3>
        <p>Responsable: <strong>{{ responsableTurno }}</strong></p>
        <p class="confirm-detail">Una vez iniciado, podras analizar etiquetas hasta que finalices el turno.</p>
        <div class="confirm-buttons">
          <button class="btn-cancelar" @click="showConfirmIniciar = false">Cancelar</button>
          <button class="btn-confirmar" @click="iniciarTurno">Si, iniciar turno</button>
        </div>
      </div>
    </div>

    <!-- Modal confirmar FINALIZAR turno -->
    <div v-if="showConfirmFinalizar" class="modal-overlay">
      <div class="confirm-content" @click.stop>
        <div class="confirm-icon confirm-icon-warn">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#c53030" stroke-width="2"/><path d="M12 9v4M12 17h.01" stroke="#c53030" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h3>Vas a finalizar el turno</h3>
        <p>Se han registrado <strong>{{ registrosTurno.length }}</strong> etiqueta(s) durante este turno.</p>
        <p class="confirm-detail">Se generara un informe con todos los registros del turno. Esta accion no se puede deshacer.</p>
        <div class="confirm-buttons">
          <button class="btn-cancelar" @click="showConfirmFinalizar = false">Cancelar</button>
          <button class="btn-confirmar btn-confirmar-danger" @click="finalizarTurno">Si, finalizar turno</button>
        </div>
      </div>
    </div>
    </template><!-- fin v-else verifyMode -->

    <!-- Camera modal (accesible desde modo normal y modo verificación) -->
    <div v-if="showCamera" class="camera-modal">
      <Camera
        :show-camera="showCamera"
        @image-captured="handleImageCaptured"
        @close-camera="closeCamera"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import Camera from './components/Camera.vue'
import { supabase } from './supabase.js'
import { jsPDF } from 'jspdf'

const webhookUrl = 'https://surexportlevante.app.n8n.cloud/webhook/65eeb484-7bfd-48fe-b09d-594e2204b6bf'
const webhookCocoUrl = 'https://surexportlevante.app.n8n.cloud/webhook/842d2503-5f47-41e2-8388-17cbbdbc5a09'
const webhookInformeTurnoUrl = 'https://surexportlevante.app.n8n.cloud/webhook/6e531e4e-2a41-46d6-ae7e-7a2a6e8bb578'
const webhookEmailEtiquetaUrl = 'https://surexportlevante.app.n8n.cloud/webhook/2306cff7-de6a-41c0-a05d-b97f12b43eb8'

// --- MODO REAL ACTIVADO ---
const isSimulationMode = ref(false)

// --- MODO VERIFICACIÓN (para integración con Hoja de Fabricación) ---
const verifyParams = (() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('mode') !== 'verify') return null
  return {
    modoProducto: params.get('modo_producto') || 'pina',
    cliente: params.get('cliente') || '',
    px: params.get('px') ? Number(params.get('px')) : null,
    orderId: params.get('order_id') || ''
  }
})()
const verifyMode = ref(verifyParams !== null)

if (verifyParams) {
  console.log('[VERIFY MODE] Parámetros recibidos:', verifyParams)
}

// Si estamos en modo verificación, abrir cámara automáticamente al cargar
onMounted(() => {
  if (verifyMode.value) {
    // Si es coco, activar el modo coco para que use el webhook correcto
    if (verifyParams.modoProducto === 'coco') {
      modoProducto.value = 'coco'
    }
    showCamera.value = true
  }
})

// --- TURNO STATE ---
const turnoActivo = ref(false)
const turnoInicioHora = ref('')
const responsableTurno = ref('')
const modoProducto = ref('pina')
const registrosTurno = ref([])
const showConfirmIniciar = ref(false)
const showConfirmFinalizar = ref(false)

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
const listaResponsables = ref(['Aurora', 'Mónica', 'Carla', 'Jorge', 'Franco'])

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

// P+X validation ranges por tipo de producto y cliente
const pxRangos = {
  'piña': {
    'LIDL':         { min: 8, max: 9 },
    'ALDI':         { min: 8, max: 9 },
    'DELMONTE':     { min: 8, max: 9 },
    'MERCADONA SA': { min: 5, max: 5 },
    'Maskom':       { min: 8, max: 9 }
  },
  'coco': {
    'DELMONTE':     { min: 7, max: 10 },
    'ALDI':         { min: 9, max: 10 }
  }
}

// El tipo de producto viene del toggle (modoProducto), no del nombre del producto
const tipoProducto = computed(() => {
  return modoProducto.value === 'coco' ? 'coco' : 'piña'
})

const getRangoActual = () => {
  const cliente = formData.value.cliente
  return pxRangos[tipoProducto.value]?.[cliente] ?? null
}

const esPxCorrecto = computed(() => {
  if (!validacionPx.value) return px_usuario.value !== null && px_usuario.value !== ''
  const pxValue = Number(px_usuario.value)
  const pxLeido = Number(validacionPx.value.px_leido)
  const rango = getRangoActual()

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

  const urlOCR = modoProducto.value === 'coco' ? webhookCocoUrl : webhookUrl

  try {
    const response = await fetch(urlOCR, {
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
  const rango = getRangoActual()

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

    const now = new Date()
    const horaRegistro = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const imagenBase64 = await fileToBase64(fileToUpload.value)

    const datosEtiqueta = {
      cliente: formData.value.cliente || '',
      producto_db: producto.value || formData.value.producto_db || '',
      origen: formData.value.origen || '',
      ean: formData.value.ean || '',
      lote: formData.value.lote || '',
      codigo_r: formData.value.codigo_r || '',
      fecha_envasado: normalizarFecha(formData.value.fecha_envasado),
      fecha_caducidad: normalizarFecha(formData.value.fecha_caducidad),
      precio_kg: formData.value.precio_kg || '',
      peso_neto: formData.value.peso_neto || '',
      importe: formData.value.importe || '',
      px_usuario: px_usuario.value || '',
      responsable: responsable.value || '',
      hora_guardado: horaRegistro
    }

    const { error: dbError } = await supabase
      .from('audit_logs')
      .insert([{
        timestamp: new Date().toISOString(),
        cliente: datosEtiqueta.cliente,
        ean: datosEtiqueta.ean,
        px_usuario: datosEtiqueta.px_usuario,
        estado: 'GUARDADA',
        detalles: datosEtiqueta,
        navegador: navigator.userAgent.substring(0, 100)
      }])

    if (dbError) {
      throw new Error(`Error guardando en Supabase: ${dbError.message}`)
    }

    try {
      await fetch(webhookEmailEtiquetaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...datosEtiqueta, foto_base64: imagenBase64 })
      })
    } catch (emailError) {
      console.warn('No se pudo enviar el email instantáneo:', emailError)
    }

    ultimoRegistro.value = {
      producto: datosEtiqueta.producto_db,
      px: datosEtiqueta.px_usuario,
      fecha: datosEtiqueta.fecha_envasado,
      responsable: datosEtiqueta.responsable,
      id: Math.floor(Math.random() * 9999),
      imagen: previewImageUrl.value
    }

    registrosTurno.value.push({
      cliente: formData.value.cliente,
      producto: producto.value || formData.value.producto_db,
      origen: formData.value.origen,
      ean: formData.value.ean,
      lote: formData.value.lote,
      codigo_r: formData.value.codigo_r,
      fecha_envasado: formData.value.fecha_envasado,
      fecha_caducidad: formData.value.fecha_caducidad,
      precio_kg: formData.value.precio_kg,
      peso_neto: formData.value.peso_neto,
      importe: formData.value.importe,
      px: px_usuario.value,
      responsable: responsable.value,
      estado: estadoGeneral.value,
      hora: horaRegistro,
      imagen: imagenBase64
    })

    showSuccessModal.value = true

  } catch (error) {
    const msg = error.message

    await registrarEnAuditoria({
      cliente: formData.value.cliente,
      ean: formData.value.ean,
      px_usuario: px_usuario.value
    }, 'ERROR', {
      mensaje: msg,
      tipo: 'ERROR_GUARDADO'
    })

    showError(msg)
  } finally {
    isProcessing.value = false
  }
}

// --- HELPERS ---
const fileToBase64 = (file) => {
  return new Promise(resolve => {
    if (!file) { resolve(''); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxW = 800
        const scale = img.width > maxW ? maxW / img.width : 1
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => {
        console.warn('No se pudo procesar la imagen')
        resolve('')
      }
      img.src = reader.result
    }
    reader.onerror = () => {
      console.warn('No se pudo leer el archivo')
      resolve('')
    }
    reader.readAsDataURL(file)
  })
}

// --- TURNO FUNCTIONS ---
const iniciarTurno = () => {
  turnoActivo.value = true
  const now = new Date()
  turnoInicioHora.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  responsable.value = responsableTurno.value
  registrosTurno.value = []
  showConfirmIniciar.value = false
}

const finalizarTurno = async () => {
  showConfirmFinalizar.value = false
  await generarInformeTurno()
  turnoActivo.value = false
  turnoInicioHora.value = ''
  registrosTurno.value = []
  responsableTurno.value = ''
  responsable.value = ''
  resetApp()
}

const generarInformeTurno = async () => {
  const now = new Date()
  const horaFin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const registros = registrosTurno.value
  const fecha = fechaHoyFormato.value
  const responsable = responsableTurno.value

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210  // ancho A4
  const M = 15    // margen

  // ── Portada ──────────────────────────────────────────────
  doc.setFillColor(26, 54, 93)
  doc.rect(0, 0, PW, 40, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('CONTROL ETIQUETADO IV GAMA', PW / 2, 18, { align: 'center' })
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Informe de turno', PW / 2, 28, { align: 'center' })

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  let y = 55
  const lineH = 8
  doc.text('Fecha:', M, y);        doc.setFont('helvetica', 'normal'); doc.text(fecha, M + 35, y); y += lineH
  doc.setFont('helvetica', 'bold')
  doc.text('Responsable:', M, y);  doc.setFont('helvetica', 'normal'); doc.text(responsable, M + 35, y); y += lineH
  doc.setFont('helvetica', 'bold')
  doc.text('Hora inicio:', M, y);  doc.setFont('helvetica', 'normal'); doc.text(turnoInicioHora.value, M + 35, y); y += lineH
  doc.setFont('helvetica', 'bold')
  doc.text('Hora fin:', M, y);     doc.setFont('helvetica', 'normal'); doc.text(horaFin, M + 35, y); y += lineH
  doc.setFont('helvetica', 'bold')
  doc.text('Total etiquetas:', M, y); doc.setFont('helvetica', 'normal'); doc.text(String(registros.length), M + 35, y)

  // ── Una página por etiqueta ───────────────────────────────
  for (const [i, r] of registros.entries()) {
    doc.addPage()

    // Cabecera azul
    doc.setFillColor(26, 54, 93)
    doc.rect(0, 0, PW, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    const titulo = r.producto || 'Sin nombre'
    doc.text(titulo, PW / 2, 12, { align: 'center', maxWidth: PW - 2 * M })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Etiqueta ${i + 1} de ${registros.length}  ·  ${r.cliente || '-'}  ·  ${r.hora || '-'}`, PW / 2, 22, { align: 'center' })

    // Imagen
    if (r.imagen) {
      const imgW = 120
      const imgH = 85
      const imgX = (PW - imgW) / 2
      const imgFormat = r.imagen.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(r.imagen, imgFormat, imgX, 33, imgW, imgH)
    }

    // Línea separadora
    const tabY = 125
    doc.setDrawColor(200, 200, 200)
    doc.line(M, tabY - 3, PW - M, tabY - 3)

    // Tabla de datos (2 columnas: etiqueta | valor)
    const campos = [
      ['Cliente',         r.cliente         || '-'],
      ['Origen',          r.origen          || '-'],
      ['EAN',             r.ean             || '-'],
      ['Lote',            r.lote            || '-'],
      ['Código R',        r.codigo_r        || '-'],
      ['Fecha envasado',  r.fecha_envasado  || '-'],
      ['Fecha caducidad', r.fecha_caducidad || '-'],
      ['Precio/kg',       r.precio_kg       || '-'],
      ['Peso neto',       r.peso_neto       || '-'],
      ['Importe',         r.importe         || '-'],
      ['P+X',             r.px              || '-'],
      ['Responsable',     r.responsable     || '-'],
    ]

    doc.setFontSize(10)
    let ty = tabY
    campos.forEach(([label, val], idx) => {
      const bg = idx % 2 === 0 ? [237, 242, 247] : [255, 255, 255]
      doc.setFillColor(...bg)
      doc.rect(M, ty, PW - 2 * M, 9, 'F')
      doc.setTextColor(26, 54, 93)
      doc.setFont('helvetica', 'bold')
      doc.text(label, M + 2, ty + 6.5)
      doc.setTextColor(30, 30, 30)
      doc.setFont('helvetica', 'normal')
      doc.text(String(val), M + 55, ty + 6.5)
      ty += 9
    })

    // Estado con color
    const estadoColor = (r.estado || 'OK').toUpperCase().includes('NOK') || (r.estado || '').toUpperCase().includes('ERROR')
      ? [197, 48, 48]
      : [39, 103, 73]
    doc.setFillColor(...estadoColor)
    doc.roundedRect(M, ty + 4, 40, 10, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text((r.estado || 'OK').toUpperCase(), M + 20, ty + 10.5, { align: 'center' })
  }

  // Descargar
  const nombreFichero = `informe_turno_${fecha.replace(/\//g, '-')}_${responsable}.pdf`
  doc.save(nombreFichero)

  // Enviar a n8n por email
  const pdfBlob = doc.output('blob')
  const fd = new FormData()
  fd.append('pdf', pdfBlob, nombreFichero)
  fd.append('fecha', fecha)
  fd.append('responsable', responsable)
  fd.append('total', String(registros.length))
  fd.append('hora_inicio', turnoInicioHora.value)
  fd.append('hora_fin', horaFin)
  await fetch(webhookInformeTurnoUrl, { method: 'POST', body: fd })
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
  responsable.value = responsableTurno.value

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
/* ========== TURNO SCREEN ========== */
.turno-screen {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

/* ========== MODO VERIFICACIÓN (iframe Hoja de Fabricación) ========== */
.verify-screen {
  min-height: 100vh;
  background: linear-gradient(135deg, #f0f4f8 0%, #d6e4f0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.verify-card {
  background: white;
  border-radius: 16px;
  padding: 32px 28px;
  max-width: 420px;
  width: 100%;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}
.verify-icon { margin-bottom: 12px; }
.verify-title {
  font-size: 20px;
  font-weight: 900;
  color: #1a365d;
  margin: 0 0 6px;
  letter-spacing: 1px;
}
.verify-subtitle {
  font-size: 13px;
  color: #718096;
  margin: 0 0 20px;
}
.verify-info {
  background: #f7fafc;
  border-left: 4px solid #38a169;
  padding: 14px 16px;
  margin: 16px 0;
  text-align: left;
  border-radius: 6px;
  font-size: 14px;
  color: #2d3748;
}
.verify-info > div {
  padding: 4px 0;
}
.verify-hint {
  font-size: 13px;
  color: #4a5568;
  margin: 16px 0 0;
  font-style: italic;
}

.turno-card {
  background: white;
  border-radius: 20px;
  padding: 40px 36px;
  max-width: 420px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.turno-icon { margin-bottom: 16px; }

.turno-title {
  font-size: 22px;
  font-weight: 900;
  color: #1a365d;
  margin: 0 0 8px;
}

.turno-subtitle {
  font-size: 14px;
  color: #718096;
  margin: 0 0 16px;
  line-height: 1.4;
}

.turno-fecha {
  background: #fef9c3;
  border: 2px solid #d4a017;
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: 700;
  font-size: 16px;
  color: #1a202c;
  display: inline-block;
  margin-bottom: 24px;
}

.turno-field {
  text-align: left;
  margin-bottom: 24px;
}

.turno-select {
  font-size: 16px;
}

.btn-iniciar-turno {
  background: linear-gradient(135deg, #38a169, #2f855a);
  color: white;
  border: none;
  padding: 16px 40px;
  font-size: 18px;
  font-weight: 800;
  border-radius: 12px;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(56, 161, 105, 0.4);
  width: 100%;
}
.btn-iniciar-turno:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(56, 161, 105, 0.5);
}
.btn-iniciar-turno:disabled {
  background: #a0aec0;
  cursor: not-allowed;
  box-shadow: none;
}

/* ========== FINALIZAR TURNO HEADER BUTTON ========== */
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.btn-finalizar-turno-header {
  background: linear-gradient(135deg, #e53e3e, #c53030);
  color: white;
  border: none;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-finalizar-turno-header:hover {
  background: linear-gradient(135deg, #c53030, #9b2c2c);
  transform: translateY(-1px);
}

/* ========== MODO TOGGLE PIÑA / COCO ========== */
.modo-toggle {
  display: inline-flex;
  background: #edf2f7;
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.modo-btn {
  background: transparent;
  border: none;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #718096;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.modo-btn:hover:not(.modo-btn-active) {
  color: #2d3748;
  background: rgba(255, 255, 255, 0.5);
}
.modo-btn-active {
  color: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}
.modo-btn-active.modo-pina {
  background: linear-gradient(135deg, #38a169, #2f855a);
}
.modo-btn-active.modo-coco {
  background: linear-gradient(135deg, #8b5e3c, #6b4423);
}

/* ========== CONFIRM MODALS ========== */
.confirm-content {
  background: white;
  border-radius: 20px;
  padding: 36px;
  text-align: center;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 50px rgba(0,0,0,0.25);
}
.confirm-content h3 {
  margin: 16px 0 8px;
  font-size: 20px;
  color: #1a202c;
}
.confirm-content p {
  color: #4a5568;
  margin: 4px 0;
  font-size: 15px;
}
.confirm-detail {
  color: #718096 !important;
  font-size: 13px !important;
  margin-top: 8px !important;
  margin-bottom: 20px !important;
}
.confirm-icon { margin-bottom: 4px; }

.confirm-buttons {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.btn-cancelar {
  flex: 1;
  padding: 12px;
  border: 2px solid #e2e8f0;
  background: white;
  color: #4a5568;
  font-size: 15px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-cancelar:hover { background: #f7fafc; border-color: #cbd5e0; }

.btn-confirmar {
  flex: 1;
  padding: 12px;
  border: none;
  background: linear-gradient(135deg, #38a169, #2f855a);
  color: white;
  font-size: 15px;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-confirmar:hover { transform: translateY(-1px); }

.btn-confirmar-danger {
  background: linear-gradient(135deg, #e53e3e, #c53030);
}

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
.image-slot-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-galeria {
  background: white;
  border: 2px solid #1a365d;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 700;
  color: #1a365d;
  cursor: pointer;
  text-align: center;
  transition: background 0.2s;
}
.btn-galeria:hover { background: #edf2f7; }

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

  .header-actions { flex-direction: column; gap: 6px; }
}

@media (max-width: 600px) {
  .turno-card { padding: 28px 20px; }
  .turno-title { font-size: 18px; }
  .btn-iniciar-turno { font-size: 16px; padding: 14px; }

  .app-header {
    padding: 10px 12px;
    gap: 8px;
    flex-wrap: wrap;
  }
  .header-title h1 { font-size: 15px; }
  .subtitle { font-size: 10px; }
  .header-date { font-size: 11px; padding: 4px 8px; }
  .back-btn { width: 36px; height: 36px; }
  .btn-finalizar-turno-header { font-size: 11px; padding: 6px 10px; }

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
