# Martie 2.0 — Reglas no negociables

## Arquitectura
- GitHub es el repositorio principal.
- Cloudflare es la infraestructura.
- Workers es el backend/API.
- D1 será la base de datos.
- R2 será el almacenamiento de archivos e imágenes.
- El frontend no accede directamente a D1.
- Las reglas críticas se validan en backend.

## UX/UI
- Mobile-first.
- Respetar el mockup aprobado de Martie 2.0.
- Fondo crema, verde oscuro, café/caramelo, tarjetas redondeadas y estética cálida/premium.
- Evitar UI SaaS genérica.

## Autenticación
- 100% nativa de Martie.
- No Google, Apple, Facebook, Firebase Auth ni proveedores externos.

## Desarrollo
- No cambiar arquitectura o reglas de negocio sin autorización explícita.
- No modificar el Worker o D1 de la versión anterior.
