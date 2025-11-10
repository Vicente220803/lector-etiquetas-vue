import { createClient } from '@supabase/supabase-js'

// Leemos las variables de entorno que creamos en el archivo .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

// Creamos y exportamos el cliente de Supabase para poder usarlo en toda la app
export const supabase = createClient(supabaseUrl, supabaseKey)