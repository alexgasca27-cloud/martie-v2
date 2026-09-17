# Martie 2.0 — Activación en Cloudflare

La aplicación ya incluye frontend, Worker/API, migración D1 y workflow de deploy. Para producción faltan únicamente recursos/credenciales de la cuenta Cloudflare, que no deben guardarse en el repositorio.

## 1. Crear D1

En Cloudflare crea una base D1 llamada `martie-v2`. Copia su `database_id`.

## 2. GitHub Actions secrets

En Settings → Secrets and variables → Actions agrega:

- `CLOUDFLARE_API_TOKEN`: token con permisos para Workers y D1.
- `CLOUDFLARE_ACCOUNT_ID`: Account ID de Cloudflare.
- `CLOUDFLARE_D1_DATABASE_ID`: ID de la D1 `martie-v2`.

El workflow `.github/workflows/deploy.yml` genera una configuración temporal, aplica `database/migrations/0001_initial.sql` y despliega el Worker.

## 3. Primer administrador

Registra primero la cuenta que administrará Martie. Después, desde la consola D1 ejecuta una sola vez:

```sql
UPDATE users SET role='admin' WHERE email='TU_CORREO';
```

Cierra sesión y vuelve a entrar. La interfaz cambiará automáticamente al panel administrativo.

## 4. Reglas de negocio implementadas

- Auth propia de Martie; no Google/Apple/Firebase.
- Pedidos pickup o delivery.
- Efectivo, tarjeta únicamente en terminal y transferencia.
- Transferencia solicita comprobante por WhatsApp.
- Primer horario: +40 min; siguientes cortes de 15 min.
- Operación: lunes a viernes, 09:00–19:00.
- Martie Club: $100 = 10 puntos.
- Beneficio de cumpleaños documentado con antigüedad mínima de 3 meses.
- Administración de pedidos y productos mediante API.
- PWA instalable y shell offline.

## 5. Prueba sin D1

Si el Worker detecta que D1 todavía no está vinculado, la interfaz ofrece `Modo demo`. Ese modo permite probar navegación, menú, carrito, checkout, pedidos y puntos utilizando almacenamiento local del dispositivo.

## 6. Pendientes de datos reales

Antes de lanzamiento comercial sustituir el menú seed por precios/productos definitivos, agregar el número real de WhatsApp de Martie y cargar las fotografías reales de productos en R2 o URLs públicas.
