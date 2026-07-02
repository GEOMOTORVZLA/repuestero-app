# Plantillas de correo Auth (Supabase)

Copias de respaldo de las plantillas HTML que se pegan en el dashboard de Supabase, no en el codigo de la app.

## Reset password

1. Supabase Dashboard -> tu proyecto -> Authentication -> Email Templates
2. Abre Reset password (a veces Recovery)
3. Copia todo el contenido de `reset-password.html` y pegalo en el editor
4. Save

Si en el editor el archivo se ve con caracteres raros (problema UTF-16 en Windows), regeneralo sin tocar nada mas:

```bash
node scripts/write-reset-password-template.mjs
```

Luego cierra y vuelve a abrir `reset-password.html` en el IDE antes de copiar.

Variables usadas por Supabase (no quitar):

- `{{ .SiteURL }}` — URL del sitio configurada en Auth
- `{{ .ConfirmationURL }}` — enlace de un solo uso para restablecer contrasena

## URL Configuration (obligatorio)

En Authentication -> URL Configuration:

| Campo | Valor recomendado |
|--------|-------------------|
| Site URL | `https://geomotorvzla.com` |
| Redirect URLs | `https://geomotorvzla.com/**` |
| | `https://www.geomotorvzla.com/**` |
| | `http://localhost:5173/**` (desarrollo) |
| | `com.geomotor.app://auth/callback` (APK) |

La app envia `redirectTo` via `src/utils/authRedirect.ts` (`authEmailRedirectTo()`).

## Prueba del flujo Reset password

1. App -> Iniciar sesion -> Olvide mi contrasena
2. Correo de prueba y enviar
3. Revisar correo en espanol con boton Elegir nueva contrasena
4. Pulsar boton -> pantalla Restablecer contrasena
5. Nueva contrasena y confirmar exito
