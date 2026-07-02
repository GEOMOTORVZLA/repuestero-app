/**
 * Escribe docs/email-templates/reset-password.html en UTF-8 (sin BOM).
 * Uso: node scripts/write-reset-password-template.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const out = path.join(process.cwd(), 'docs', 'email-templates', 'reset-password.html');

const lines = [
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#e8ecf1;">',
  '  <tr>',
  '    <td align="center" style="padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">',
  '      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d8dee6;box-shadow:0 8px 24px rgba(17,24,39,0.06);">',
  '        <tr>',
  '          <td style="background:linear-gradient(90deg,#1d4ed8 0%,#2563eb 45%,#3b82f6 100%);padding:0;height:6px;line-height:6px;font-size:0;">&nbsp;</td>',
  '        </tr>',
  '        <tr>',
  '          <td style="padding:28px 32px 12px;text-align:center;background:#f8fafc;border-bottom:1px solid #e5e7eb;">',
  '            <a href="{{ .SiteURL }}" style="text-decoration:none;display:inline-block;" target="_blank">',
  '              <img',
  '                src="https://hmaugrrnpdmbbruddswr.supabase.co/storage/v1/object/public/publicos/mail/logo-geomotor.png"',
  '                alt="Geomotor"',
  '                width="200"',
  '                style="display:block;margin:0 auto;border:0;max-width:100%;height:auto;"',
  '              />',
  '            </a>',
  '            <p style="margin:14px 0 0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:bold;">',
  '              Repuestos &amp; talleres cerca de ti',
  '            </p>',
  '          </td>',
  '        </tr>',
  '        <tr>',
  '          <td style="padding:28px 32px 8px;">',
  '            <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:#0f172a;text-align:center;font-weight:700;">',
  '              Restablece tu contrase&ntilde;a',
  '            </h1>',
  '            <p style="margin:0 0 8px;font-size:16px;line-height:1.55;color:#475569;text-align:center;">',
  '              Recibimos una solicitud para cambiar la contrase&ntilde;a de tu cuenta en <strong style="color:#1e293b;">Geomotor</strong>.',
  '            </p>',
  '            <p style="margin:0 0 26px;font-size:15px;line-height:1.55;color:#64748b;text-align:center;">',
  '              Pulsa el bot&oacute;n de abajo para elegir una contrase&ntilde;a nueva. El enlace caduca por seguridad; si expir&oacute;, vuelve a solicitar el restablecimiento desde la app.',
  '            </p>',
  '            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 22px;">',
  '              <tr>',
  '                <td align="center" bgcolor="#2563eb" style="border-radius:10px;background:#2563eb;">',
  '                  <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">',
  '                    Elegir nueva contrase&ntilde;a',
  '                  </a>',
  '                </td>',
  '              </tr>',
  '            </table>',
  '            <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#94a3b8;text-align:center;">',
  '              Si el bot&oacute;n no funciona,',
  '              <a href="{{ .ConfirmationURL }}" target="_blank" style="color:#2563eb;text-decoration:underline;font-weight:bold;">',
  '                usa este enlace alternativo',
  '              </a>.',
  '            </p>',
  '            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;border-radius:10px;border:1px solid #e2e8f0;">',
  '              <tr>',
  '                <td style="padding:14px 16px;">',
  '                  <p style="margin:0;font-size:13px;line-height:1.5;color:#475569;text-align:center;">',
  '                    <strong style="color:#0f172a;">&iquest;No pediste cambiar la contrase&ntilde;a?</strong><br />',
  '                    Ignora este mensaje; tu contrase&ntilde;a actual no cambiar&aacute;.',
  '                  </p>',
  '                </td>',
  '              </tr>',
  '            </table>',
  '          </td>',
  '        </tr>',
  '        <tr>',
  '          <td style="padding:20px 32px 26px;border-top:1px solid #f1f5f9;text-align:center;background:#ffffff;">',
  '            <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#94a3b8;">',
  '              &copy; Geomotor &middot; Este es un correo autom&aacute;tico, por favor no respondas a este mensaje.',
  '            </p>',
  '            <p style="margin:0;font-size:12px;line-height:1.5;">',
  '              <a href="{{ .SiteURL }}" style="color:#2563eb;text-decoration:none;font-weight:bold;">Ir a Geomotor</a>',
  '            </p>',
  '          </td>',
  '        </tr>',
  '      </table>',
  '      <p style="margin:18px 0 0;max-width:560px;font-size:11px;line-height:1.45;color:#94a3b8;text-align:center;">',
  '        Recibes este correo porque alguien solicit&oacute; restablecer la contrase&ntilde;a de esta direcci&oacute;n. Si no fuiste t&uacute;, ignora el mensaje.',
  '      </p>',
  '    </td>',
  '  </tr>',
  '</table>',
  '',
];

const html = lines.join('\n');
fs.writeFileSync(out, html, { encoding: 'utf8' });

const buf = fs.readFileSync(out);
const okUtf8 = buf[0] === 0x3c && buf[1] !== 0x00;
if (!okUtf8) {
  console.error('[write-reset-password-template] ERROR: archivo no quedo en UTF-8');
  process.exit(1);
}

console.log('[write-reset-password-template] OK:', out, `(${buf.length} bytes, ${lines.length - 1} lineas)`);
