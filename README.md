# 🤖 WhatsApp Automatización (Multi-Tenant)

Un bot de automatización para WhatsApp 100% *stateless*, construido con [Baileys](https://github.com/WhiskeySockets/Baileys) y [Turso (libSQL)](https://turso.tech/). Permite el envío de mensajes programados (cron jobs) y manuales a contactos, grupos y canales, soportando múltiples sesiones de usuario en la misma base de datos.

## 🚀 Características
- **Multi-Tenant (Multi-Usuario):** Cada instalación o despliegue genera un `session_id` único local (`.bot_session`). Esto aísla por completo las credenciales, contactos y mensajes programados, permitiendo que varios clientes o servidores utilicen la misma base de datos Turso sin colisiones de datos.
- **100% Stateless en Local:** Toda la sesión criptográfica de WhatsApp (auth_info), caché de contactos y canales, y estados de configuración se almacenan cifrados en Turso. El servidor puede reiniciarse, destruirse o moverse a otra máquina sin perder la sesión (siempre que se migre el `.bot_session`).
- **Autenticación Dual:** Soporta escaneo clásico mediante QR Code o vinculación por Pairing Code (código numérico, ideal para servidores sin pantalla).
- **Cron Jobs y Scheduler:** Programa mensajes automáticos a contactos, grupos y canales utilizando expresiones cron estándar.

## 🛠️ Stack Tecnológico
- **Node.js** + **TypeScript**
- **Baileys (WhiskeySockets)**: Interfaz principal con WhatsApp Web.
- **Turso (libSQL)**: Base de datos Serverless edge para persistencia de sesión e historial.
- **@inquirer/prompts**: CLI interactiva para gestionar contactos y cron jobs.

## 📦 Instalación

1. Clona este repositorio:
```bash
git clone <url-del-repositorio>
cd whattsapp-automatizacion
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura tus variables de entorno. Copia el archivo de ejemplo y completa los datos de tu base de datos Turso:
```bash
cp .env.example .env
```
Asegúrate de incluir `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.

## ⚙️ Uso

Inicia el bot en modo desarrollo. Si es la primera vez que se ejecuta en la máquina, generará un `session_id` y te pedirá escanear un QR (o Pairing Code):

```bash
npm run dev
```

Una vez vinculado, verás la consola interactiva donde podrás:
- **📇 Listar contactos/grupos/canales:** Guardarlos como destinos activos.
- **📝 Programar contenido:** Configurar un cron job para enviar un mensaje recurrente a tus destinos.
- **📤 Enviar mensaje manual:** Enviar un mensaje de prueba inmediato.
- **▶️ Iniciar scheduler:** Poner a correr los trabajos en segundo plano.

## 🔒 Arquitectura Stateless y Archivos Sensibles

El archivo `.bot_session` generado en la raíz contiene tu identificador único de sesión. 
**Importante:** Nunca subas el archivo `.bot_session` ni `.env` a tu repositorio. Ya están configurados en el `.gitignore`.
- Si eliminas el `.bot_session`, el bot interpretará que es una instancia completamente nueva, generará un nuevo ID, y te pedirá volver a vincular tu WhatsApp (tus datos anteriores quedarán intactos en la DB bajo el ID viejo).
- Si copias tu `.bot_session` a otra PC o a la nube (Railway, Render, AWS), podrás retomar tu sesión exactamente donde la dejaste.

## 📝 Licencia
ISC
