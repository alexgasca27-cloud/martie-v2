# Martie 2.0 — Producción Cloudflare

## Recursos exclusivos
- Worker: `martie-v2`.
- URL: https://martie-v2.alexgasca27.workers.dev
- D1: `martie-v2-db`; el identificador está fijado en `wrangler.jsonc`.
- Binding del Worker: `DB`.
- Rama de producción en Cloudflare Builds: `build/functional-v1`; referencia de revisión: PR #1.
- No usar ni modificar `martie` o `martie-db`, que pertenecen a la versión anterior.

## Despliegue
Cloudflare Builds despliega esta rama con `npx wrangler deploy` y el token de builds existente. `wrangler.jsonc` es la configuración compartida y fija el Worker y la D1 exclusivos. Las rutas `/api/*` ejecutan el Worker antes del fallback SPA. Los archivos públicos se sirven mediante `ASSETS`.

La migración `database/migrations/0001_initial.sql` se aplicó desde la consola de esta D1 el 17 de septiembre de 2026. Se verificaron las seis tablas y los ocho productos iniciales. Esta ejecución manual no crea el registro de migraciones de Wrangler; la primera ejecución con Wrangler volverá a procesarla. La migración inicial utiliza `IF NOT EXISTS` e `INSERT OR IGNORE`.

Para futuras migraciones, aplicar antes del despliegue:
```sh
npx wrangler d1 migrations apply martie-v2-db --remote
npx wrangler deploy
```
El token que ejecute migraciones necesita permisos D1 en esta cuenta.

GitHub Actions queda como alternativa **manual**, para evitar dos despliegues automáticos compitiendo. Requiere el secret `CLOUDFLARE_API_TOKEN` con permisos adecuados; no fue configurado ni probado en esta activación. Usa la misma configuración del repositorio. Ejecutarlo sobre `build/functional-v1`.

## Administrador
El correo indicado es `CORREO_ADMIN`. El propietario debe registrar su cuenta con su propia contraseña. Una vez exista, ejecutar únicamente sobre `martie-v2-db`:
```sql
UPDATE users SET role='admin' WHERE email='CORREO_ADMIN';
SELECT email, role FROM users WHERE email='CORREO_ADMIN';
```
Después debe cerrar sesión y volver a entrar.

## WhatsApp y catálogo
Las confirmaciones abren WhatsApp hacia `el número comercial configurado`. La aplicación prepara el mensaje; el cliente debe enviarlo. No hay envío automático ni validación bancaria del comprobante.
El catálogo conserva los ocho productos y precios de ejemplo de la migración. Confirmar catálogo, precios y fotos antes del lanzamiento comercial.

## Verificación y límites
Se comprobaron salud con D1, lectura del menú, errores JSON, rutas protegidas, recursos de la PWA y registro/inicio de sesión de una cuenta técnica autorizada. No se generaron pedidos reales.
La instalación en teléfonos y el comportamiento offline deben comprobarse también en los dispositivos objetivo.

La activación de infraestructura no sustituye la revisión de seguridad y reglas de negocio: el código original usa SHA-256 para contraseñas, interpolación HTML sin escape general, horarios del servidor y puntos al crear pedidos. Estas áreas requieren endurecimiento antes de un lanzamiento comercial amplio.
