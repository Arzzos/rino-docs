# Política de seguridad (Beta)

> In English: [`SECURITY.md`](SECURITY.md).

Rino Docs está en **Beta**: PWA solo-cliente, sin backend, datos en IndexedDB/LocalStorage.
Sin SLA de producción.

## Reportar una vulnerabilidad

- Preferido: GitHub → Security → "Report a vulnerability" (aviso privado).
- Incluye: versión, área afectada (`app/src/...`), pasos, impacto.
- NO abras un issue público para fallos sensibles ni adjuntes archivos con datos personales/de alumnos.

## Notas de alcance

- Fuera de alcance: cuenta/DNS de Cloudflare, dispositivos de usuarios.
- Los secretos de despliegue (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) solo viven en secrets de GitHub Actions, nunca en código.
