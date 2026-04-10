import { createApp } from 'vue'
import './assets/main.css'
import App from './App.vue'

const INSTANCE_KEY = 'lector_etiquetas_activo'
const PING_INTERVAL = 2000   // actualiza cada 2s
const STALE_TIMEOUT = 5000   // si no hay ping en 5s, la instancia se considera cerrada

function instanciaActiva() {
  const ultimo = localStorage.getItem(INSTANCE_KEY)
  if (!ultimo) return false
  return Date.now() - parseInt(ultimo) < STALE_TIMEOUT
}

if (instanciaActiva()) {
  // Ya hay una pestaña con la app abierta
  document.body.style.cssText = 'margin:0;font-family:Arial,sans-serif;background:#f0f4f8'
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;text-align:center;padding:20px">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="#1a365d" stroke-width="2"/>
        <path d="M12 6v6l4 2" stroke="#1a365d" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h2 style="color:#1a365d;margin:0;font-size:22px">La app ya está abierta</h2>
      <p style="color:#4a5568;margin:0;font-size:15px">El lector de etiquetas ya está activo en otra pestaña.<br>Vuelve a esa pestaña para continuar.</p>
      <button onclick="window.close()" style="padding:12px 28px;background:#1a365d;color:white;border:none;border-radius:10px;font-size:16px;font-weight:bold;cursor:pointer">
        Cerrar esta pestaña
      </button>
    </div>`
  window.close()
} else {
  // Esta pestaña es la instancia principal
  localStorage.setItem(INSTANCE_KEY, Date.now().toString())

  const intervalo = setInterval(() => {
    localStorage.setItem(INSTANCE_KEY, Date.now().toString())
  }, PING_INTERVAL)

  window.addEventListener('beforeunload', () => {
    clearInterval(intervalo)
    localStorage.removeItem(INSTANCE_KEY)
  })

  createApp(App).mount('#app')
}
