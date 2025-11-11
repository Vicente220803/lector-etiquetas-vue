# Lector de Etiquetas - Vue.js

Una aplicación web moderna y profesional para la captura y análisis de etiquetas de productos mediante OCR. Construida con Vue 3, Vite y Supabase.

## ✨ Características

- 📷 **Captura de imágenes**: Toma fotos directamente desde la cámara del dispositivo o selecciona archivos
- 🔍 **Análisis OCR**: Procesamiento inteligente de texto en etiquetas usando IA
- ✏️ **Edición de datos**: Interfaz intuitiva para revisar y corregir datos extraídos
- 💾 **Almacenamiento en la nube**: Integración con Supabase para persistencia de datos
- 📱 **Responsive**: Diseño adaptativo que funciona en desktop y móvil
- ♿ **Accesibilidad**: Cumple con estándares WCAG para usuarios con discapacidades
- 🎨 **UI Moderna**: Diseño elegante con animaciones suaves y gradientes

## 🚀 Tecnologías

- **Vue 3** - Framework progresivo de JavaScript
- **Vite** - Build tool ultrarrápido
- **Supabase** - Backend as a Service
- **Tailwind CSS** - Framework de estilos utilitarios
- **MediaDevices API** - Acceso a cámara del dispositivo

## 📋 Requisitos

- Node.js 20.19.0 o superior
- npm o yarn
- Cuenta de Supabase (para almacenamiento de datos)

## 🛠️ Instalación

1. **Clona el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/lector-etiquetas-vue.git
   cd lector-etiquetas-vue
   ```

2. **Instala dependencias**
   ```bash
   npm install
   ```

3. **Configura variables de entorno**
   Crea un archivo `.env.local` en la raíz del proyecto:
   ```env
   VITE_SUPABASE_URL=tu_supabase_url
   VITE_SUPABASE_KEY=tu_supabase_anon_key
   ```

4. **Ejecuta el servidor de desarrollo**
   ```bash
   npm run dev
   ```

## 📖 Uso

1. **Captura una imagen**: Usa el botón "Tomar Foto" para acceder a la cámara o "Seleccionar Archivo" para subir una imagen
2. **Vista previa**: Revisa la imagen capturada y haz zoom si es necesario
3. **Análisis**: Envía la imagen para procesamiento OCR
4. **Edición**: Revisa y corrige los datos extraídos en el modal de edición
5. **Guardado**: Los datos se almacenan automáticamente en Supabase

## 🏗️ Arquitectura

```
src/
├── components/
│   ├── Camera.vue       # Componente de captura de cámara
│   └── EditModal.vue    # Modal de edición de datos
├── App.vue             # Componente principal
├── main.js            # Punto de entrada
└── supabase.js        # Configuración de Supabase
```

## 🎯 Mejoras Implementadas

- **Validación robusta**: Verificación de tipos y tamaños de archivos
- **Manejo de errores**: Sistema de notificaciones toast para errores
- **Optimización de rendimiento**: Cache de imágenes y gestión de memoria
- **Accesibilidad**: Soporte completo para lectores de pantalla y navegación por teclado
- **UX mejorada**: Estados de carga animados y feedback visual
- **Diseño profesional**: Paleta de colores moderna y animaciones suaves

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Contacto

Tu Nombre - tu.email@ejemplo.com

Link del proyecto: [https://github.com/tu-usuario/lector-etiquetas-vue](https://github.com/tu-usuario/lector-etiquetas-vue)
