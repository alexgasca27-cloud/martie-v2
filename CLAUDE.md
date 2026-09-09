# Martie 2.0 — Reglas del proyecto

## Arquitectura
- GitHub es el repositorio principal.
- Cloudflare es la infraestructura.
- Backend/API en Cloudflare Workers.
- Base de datos en Cloudflare D1.
- Archivos e imágenes en Cloudflare R2.
- El frontend nunca accede directamente a D1.
- Las reglas críticas se validan en backend.

## UX/UI
- Mobile-first.
- Respetar la referencia visual aprobada de Martie 2.0.
- Estética cálida, premium, editorial y amigable.
- Evitar interfaces SaaS genéricas.

## Autenticación
- Autenticación 100% nativa de Martie.
- No usar Google, Apple, Facebook, Firebase Auth ni proveedores externos.

## Desarrollo
- No cambiar arquitectura o reglas de negocio sin autorización explícita.
- No modificar recursos de la versión anterior de Martie.
