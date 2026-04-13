import { createRoot } from 'react-dom/client';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  createRoot(document.getElementById('root')!).render(
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '1.5rem',
        maxWidth: '36rem',
        margin: '2rem auto',
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ fontSize: '1.25rem' }}>Configuración incompleta</h1>
      <p>
        Faltan <code>VITE_SUPABASE_URL</code> y/o <code>VITE_SUPABASE_ANON_KEY</code> en el entorno de
        compilación.
      </p>
      <p>
        En <strong>Vercel</strong>: Project → Settings → Environment Variables → añade ambas para
        <strong> Production </strong>
        (y Preview si aplica), luego redeploy.
      </p>
      <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
        Si ya están definidas, abre la consola del navegador (F12) por si hay otro error.
      </p>
    </div>
  );
} else {
  void import('./main-app').catch((err: unknown) => {
    console.error('No se pudo cargar la aplicación:', err);
    const root = document.getElementById('root');
    if (!root) return;
    const detail = err instanceof Error ? err.message : String(err);
    root.innerHTML = `
      <div style="font-family: system-ui, sans-serif; padding: 1.5rem; max-width: 36rem; margin: 2rem auto; line-height: 1.5;">
        <h1 style="font-size: 1.25rem;">Error al cargar la aplicación</h1>
        <p>No se pudo descargar o ejecutar el código principal. Comprueba la red (F12 → Red), desactiva bloqueadores o prueba otra red.</p>
        <p style="color: #64748b; font-size: 0.875rem; word-break: break-all;">${detail.replace(/</g, '&lt;')}</p>
      </div>`;
  });
}
