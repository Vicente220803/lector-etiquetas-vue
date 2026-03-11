-- Tabla de auditoría para registrar cada lectura de etiqueta
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  cliente TEXT,
  ean TEXT,
  px_usuario INTEGER,
  estado TEXT NOT NULL, -- 'GUARDADA', 'ERROR_WEBHOOK', 'ERROR_N8N'
  detalles JSONB,
  navegador TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para mejor rendimiento en búsquedas
CREATE INDEX IF NOT EXISTS audit_logs_cliente_idx ON audit_logs(cliente);
CREATE INDEX IF NOT EXISTS audit_logs_estado_idx ON audit_logs(estado);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_logs_ean_idx ON audit_logs(ean);

-- Política RLS para permitir inserciones (opcional, si tienes RLS activado)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir inserciones en audit_logs" ON audit_logs
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Permitir lectura en audit_logs" ON audit_logs
  FOR SELECT USING (TRUE);
