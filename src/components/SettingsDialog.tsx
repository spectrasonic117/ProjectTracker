import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Database, ExternalLink } from 'lucide-react';
import { getStorageConfig, setStorageConfig, testNeonConnection, type StorageProvider } from '../lib/storage';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStorageChange: () => void;
}

export function SettingsDialog({ isOpen, onClose, onStorageChange }: SettingsDialogProps) {
  const [provider, setProvider] = useState<StorageProvider>('local');
  const [connectionString, setConnectionString] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Cargar configuración actual al abrir (async por el cifrado)
  useEffect(() => {
    if (isOpen) {
      getStorageConfig().then((config) => {
        setProvider(config.provider);
        setConnectionString(config.neonConnectionString ?? '');
        setTestResult('idle');
        setTestMessage('');
      });
    }
  }, [isOpen]);

  const handleTestConnection = async () => {
    if (!connectionString.trim()) return;
    setIsTesting(true);
    setTestResult('idle');
    setTestMessage('');
    try {
      await testNeonConnection(connectionString.trim());
      setTestResult('success');
      setTestMessage('Conexión exitosa a Neon');
    } catch (error) {
      setTestResult('error');
      setTestMessage(error instanceof Error ? error.message : 'Error de conexión');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    await setStorageConfig({
      provider,
      neonConnectionString: provider === 'neon' ? connectionString.trim() : undefined,
    });
    onStorageChange();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-black/[.06] bg-white p-6 shadow-xl dark:border-white/[.08] dark:bg-[#151517] fade-in slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id="settings-title" className="text-lg font-semibold">
            Ajustes
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar ajustes"
          >
            <ExternalLink size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Proveedor de almacenamiento */}
          <div>
            <label className="text-sm font-medium mb-3 block">Proveedor de almacenamiento</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.05] transition-colors">
                <input
                  type="radio"
                  name="storage-provider"
                  checked={provider === 'local'}
                  onChange={() => {
                    setProvider('local');
                    setTestResult('idle');
                    setTestMessage('');
                  }}
                  className="w-4 h-4 accent-[#0a84ff]"
                />
                <div className="flex-1 text-left">
                  <div className="font-medium">Almacenamiento local</div>
                  <div className="text-xs text-neutral-500">
                    Guarda los datos en el navegador (localStorage). Funciona offline.
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.05] transition-colors">
                <input
                  type="radio"
                  name="storage-provider"
                  checked={provider === 'neon'}
                  onChange={() => {
                    setProvider('neon');
                    setTestResult('idle');
                    setTestMessage('');
                  }}
                  className="w-4 h-4 accent-[#0a84ff]"
                />
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">Base de datos externa (Neon)</span>
                    <Database size={16} className="text-[#0a84ff]" />
                  </div>
                  <div className="text-xs text-neutral-500">
                    Sincroniza con PostgreSQL en la nube. Requiere conexión a internet.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Configuración Neon */}
          {provider === 'neon' && (
            <div className="space-y-3 p-4 rounded-lg border border-neutral-200/50 bg-neutral-50/50 dark:border-white/[.06] dark:bg-white/[.03]">
              <label className="text-sm font-medium block mb-2">
                Cadena de conexión
              </label>
              <input
                type="password"
                value={connectionString}
                onChange={(e) => {
                  setConnectionString(e.target.value);
                  setTestResult('idle');
                  setTestMessage('');
                }}
                placeholder="postgresql://user:pass@host/db?sslmode=require"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white dark:border-neutral-600 dark:bg-neutral-900 dark:text-white focus:ring-2 focus:ring-[#0a84ff]/30 focus:border-transparent outline-none"
                aria-describedby="connection-help"
              />
              <p id="connection-help" className="text-xs text-neutral-500">
                Formato: <code className="font-mono">postgresql://usuario:pass@host:puerto/db?sslmode=require</code>
              </p>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !connectionString.trim()}
                className="w-full py-2 px-3 text-sm font-medium rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                {isTesting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Probando conexión…
                  </span>
                ) : (
                  'Probar conexión'
                )}
              </button>

              {testResult !== 'idle' && (
                <div
                  className={`flex items-center gap-2 text-sm ${
                    testResult === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {testResult === 'success' ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  {testMessage}
                </div>
              )}
            </div>
          )}

          {/* Información adicional */}
          <div className="text-xs text-neutral-500 space-y-1 pt-2 border-t border-black/[.06] dark:border-white/[.08]">
            <p>El cambio de proveedor recargará los datos desde la nueva fuente.</p>
            <p>Los datos actuales en localStorage se conservan aunque cambies a Neon.</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-black/90 transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}