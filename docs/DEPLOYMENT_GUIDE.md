# Guía Completa de Exportación y Deployment de PATHXPRESS

Esta guía te llevará paso a paso desde exportar tu proyecto de Manus hasta desplegarlo en tu propio hosting con tu propia base de datos.

---

## 📋 Tabla de Contenidos

1. [Exportar el Proyecto desde Manus](#1-exportar-el-proyecto-desde-manus)
2. [Configurar el Entorno Local](#2-configurar-el-entorno-local)
3. [Configurar Base de Datos Propia](#3-configurar-base-de-datos-propia)
4. [Configurar Variables de Entorno](#4-configurar-variables-de-entorno)
5. [Hacer Modificaciones Localmente](#5-hacer-modificaciones-localmente)
6. [Preparar para Producción](#6-preparar-para-producción)
7. [Opciones de Hosting y Deployment](#7-opciones-de-hosting-y-deployment)
8. [Configuración Post-Deployment](#8-configuración-post-deployment)
9. [Mantenimiento y Actualizaciones](#9-mantenimiento-y-actualizaciones)

---

## 1. Exportar el Proyecto desde Manus

### Paso 1.1: Descargar el Código Fuente

1. En la interfaz de Manus, ve a la sección **Code** (panel derecho)
2. Haz clic en el botón **"Download All Files"** (esquina superior derecha)
3. Se descargará un archivo ZIP con todo el código del proyecto
4. Extrae el ZIP en una carpeta de tu computadora (ej: `C:\Projects\pathxpress` o `~/Projects/pathxpress`)

### Paso 1.2: Verificar la Estructura del Proyecto

Después de extraer, deberías ver esta estructura:

```
pathxpress/
├── client/                 # Frontend React + Vite
│   ├── public/            # Archivos estáticos
│   ├── src/               # Código fuente del frontend
│   └── index.html
├── server/                # Backend Express + tRPC
│   ├── _core/            # Configuración del servidor
│   ├── db.ts             # Funciones de base de datos
│   ├── routers.ts        # Rutas principales
│   └── portalRouters.ts  # Rutas del portal
├── drizzle/              # Esquema de base de datos
│   └── schema.ts
├── shared/               # Código compartido
├── package.json          # Dependencias del proyecto
├── tsconfig.json         # Configuración de TypeScript
├── vite.config.ts        # Configuración de Vite
└── .env.example          # Ejemplo de variables de entorno
```

---

## 2. Configurar el Entorno Local

### Paso 2.1: Instalar Prerequisitos

Necesitas tener instalado:

1. **Node.js** (versión 18 o superior)
   - Descarga desde: https://nodejs.org/
   - Verifica la instalación: `node --version`

2. **pnpm** (gestor de paquetes)
   - Instala con: `npm install -g pnpm`
   - Verifica: `pnpm --version`

3. **Git** (opcional pero recomendado)
   - Descarga desde: https://git-scm.com/
   - Verifica: `git --version`

### Paso 2.2: Instalar Dependencias

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
cd pathxpress
pnpm install
```

Esto instalará todas las dependencias necesarias (React, Express, tRPC, Drizzle ORM, etc.)

---

## 3. Configurar Base de Datos Propia

PATHXPRESS usa **MySQL/MariaDB** como base de datos. Tienes varias opciones:

### Opción A: Base de Datos Local (para desarrollo)

#### Usando XAMPP (Windows/Mac/Linux)

1. Descarga XAMPP: https://www.apachefriends.org/
2. Instala y ejecuta XAMPP
3. Inicia el servicio MySQL desde el panel de control
4. Abre phpMyAdmin (http://localhost/phpmyadmin)
5. Crea una nueva base de datos llamada `pathxpress`
6. Tu connection string será: `mysql://root@localhost:3306/pathxpress`

#### Usando MySQL Workbench

1. Descarga MySQL: https://dev.mysql.com/downloads/mysql/
2. Instala MySQL Server
3. Abre MySQL Workbench
4. Crea una nueva conexión y una base de datos llamada `pathxpress`
5. Tu connection string será: `mysql://root:tu_password@localhost:3306/pathxpress`

### Opción B: Base de Datos en la Nube (para producción)

#### PlanetScale (Recomendado - MySQL compatible, gratis hasta 5GB)

1. Crea cuenta en: https://planetscale.com/
2. Crea una nueva base de datos
3. Ve a "Connect" y copia la connection string
4. Ejemplo: `mysql://usuario:password@host.us-east-1.psdb.cloud/pathxpress?ssl={"rejectUnauthorized":true}`

#### AWS RDS MySQL

1. Crea cuenta en AWS: https://aws.amazon.com/
2. Ve a RDS y crea una instancia MySQL
3. Configura security groups para permitir conexiones
4. Copia el endpoint y credenciales
5. Ejemplo: `mysql://admin:password@database-1.xxxx.us-east-1.rds.amazonaws.com:3306/pathxpress`

#### DigitalOcean Managed Database

1. Crea cuenta en: https://www.digitalocean.com/
2. Crea un Managed MySQL Database
3. Descarga el certificado SSL si es necesario
4. Copia la connection string

#### Railway (Fácil y rápido)

1. Crea cuenta en: https://railway.app/
2. Crea un nuevo proyecto
3. Agrega un servicio MySQL
4. Copia la connection string desde las variables de entorno

---

## 4. Configurar Variables de Entorno

### Paso 4.1: Crear archivo .env

En la raíz del proyecto, crea un archivo llamado `.env` (sin extensión):

```bash
# En Windows (PowerShell):
New-Item .env -ItemType File

# En Mac/Linux:
touch .env
```

### Paso 4.2: Configurar Variables Esenciales

Abre el archivo `.env` y agrega lo siguiente:

```env
# === BASE DE DATOS ===
DATABASE_URL="mysql://usuario:password@host:3306/pathxpress"

# === SEGURIDAD ===
# Genera un secreto aleatorio fuerte (mínimo 32 caracteres)
JWT_SECRET="tu-secreto-super-seguro-cambialo-por-algo-aleatorio-123456"

# === OAUTH (Si quieres mantener login con Manus) ===
OAUTH_SERVER_URL="https://api.manus.im"
VITE_OAUTH_PORTAL_URL="https://auth.manus.im"
VITE_APP_ID="tu-app-id-de-manus"

# === INFORMACIÓN DEL PROPIETARIO ===
OWNER_OPEN_ID="tu-open-id"
OWNER_NAME="Tu Nombre"

# === APLICACIÓN ===
VITE_APP_TITLE="PATHXPRESS"
VITE_APP_LOGO="/logo.svg"

# === PUERTO ===
PORT=3000

# === MODO ===
NODE_ENV=development
```

### Paso 4.3: Generar JWT_SECRET Seguro

Puedes generar un secreto aleatorio con:

```bash
# En Node.js (ejecuta en terminal):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# O usa un generador online:
# https://generate-secret.vercel.app/32
```

### Paso 4.4: Configurar OAuth (Opcional)

Si quieres mantener el login con Manus OAuth:

1. Contacta a soporte de Manus para obtener credenciales OAuth
2. Agrega `VITE_APP_ID` y otros valores OAuth al `.env`

**Alternativa:** Implementar tu propio sistema de autenticación (email/password, Google, etc.)

---

## 5. Hacer Modificaciones Localmente

### Paso 5.1: Ejecutar el Proyecto en Desarrollo

```bash
# En la carpeta del proyecto:
pnpm dev
```

Esto iniciará:
- Frontend en: http://localhost:5173
- Backend API en: http://localhost:3000

### Paso 5.2: Aplicar el Esquema de Base de Datos

La primera vez que ejecutes el proyecto, necesitas crear las tablas:

```bash
pnpm db:push
```

Esto creará todas las tablas necesarias en tu base de datos.

### Paso 5.3: Poblar Datos Iniciales (Opcional)

Ejecuta los scripts de seed para crear datos de prueba:

```bash
# Crear tarifas iniciales
pnpm tsx scripts/seed-rates.ts

# Crear datos COD de prueba
pnpm tsx scripts/seed-cod-data.ts
```

### Paso 5.4: Crear Usuario Administrador

Usa el script de gestión de usuarios:

```bash
pnpm tsx scripts/manage-users.ts
```

Edita el archivo `scripts/manage-users.ts` antes de ejecutarlo para configurar tus credenciales.

### Paso 5.5: Hacer Modificaciones

Ahora puedes modificar el código:

#### Modificar el Frontend

- Archivos en `client/src/`
- Componentes en `client/src/components/`
- Páginas en `client/src/pages/`
- Estilos en `client/src/index.css`

#### Modificar el Backend

- Rutas API en `server/routers.ts` y `server/portalRouters.ts`
- Lógica de base de datos en `server/db.ts`
- Esquema de BD en `drizzle/schema.ts`

#### Modificar Base de Datos

1. Edita `drizzle/schema.ts`
2. Ejecuta `pnpm db:push` para aplicar cambios

**Importante:** Los cambios se reflejan automáticamente gracias a Hot Module Replacement (HMR)

---

## 6. Preparar para Producción

### Paso 6.1: Actualizar Variables de Entorno

Crea un archivo `.env.production` con valores de producción:

```env
NODE_ENV=production
DATABASE_URL="tu-connection-string-de-produccion"
JWT_SECRET="secreto-diferente-para-produccion"
PORT=3000

# URLs de producción
VITE_APP_URL="https://tudominio.com"
```

### Paso 6.2: Construir el Proyecto

```bash
pnpm build
```

Esto genera:
- `dist/` - Frontend compilado
- `server/` - Backend listo para producción

### Paso 6.3: Probar Build de Producción Localmente

```bash
pnpm start
```

Verifica que todo funcione correctamente en: http://localhost:3000

---

## 7. Opciones de Hosting y Deployment

### Opción A: Vercel (Recomendado para Full-Stack)

**Pros:** Fácil, gratis para proyectos pequeños, SSL automático, CDN global
**Contras:** Límites en plan gratuito

#### Pasos:

1. Crea cuenta en: https://vercel.com/
2. Instala Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. En la carpeta del proyecto:
   ```bash
   vercel
   ```
4. Sigue las instrucciones en pantalla
5. Configura variables de entorno en el dashboard de Vercel:
   - Ve a tu proyecto → Settings → Environment Variables
   - Agrega todas las variables del `.env`
6. Despliega:
   ```bash
   vercel --prod
   ```

### Opción B: Railway

**Pros:** Muy fácil, incluye base de datos, gratis hasta $5/mes de uso
**Contras:** Puede ser más caro a escala

#### Pasos:

1. Crea cuenta en: https://railway.app/
2. Crea un nuevo proyecto desde GitHub o CLI
3. Agrega servicio MySQL desde el dashboard
4. Conecta tu repositorio
5. Configura variables de entorno en el dashboard
6. Railway despliega automáticamente

### Opción C: DigitalOcean App Platform

**Pros:** Control total, escalable, buen precio
**Contras:** Requiere más configuración

#### Pasos:

1. Crea cuenta en: https://www.digitalocean.com/
2. Ve a App Platform
3. Conecta tu repositorio de GitHub
4. Configura:
   - Build Command: `pnpm build`
   - Run Command: `pnpm start`
5. Agrega variables de entorno
6. Despliega

### Opción D: VPS Tradicional (AWS EC2, DigitalOcean Droplet, Linode)

**Pros:** Control total, más barato a largo plazo
**Contras:** Requiere conocimientos de DevOps

#### Pasos Generales:

1. Crea un servidor (Ubuntu 22.04 recomendado)
2. Conéctate por SSH
3. Instala Node.js y pnpm:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   npm install -g pnpm
   ```
4. Clona tu proyecto:
   ```bash
   git clone tu-repositorio.git
   cd pathxpress
   pnpm install
   ```
5. Configura `.env` en el servidor
6. Instala PM2 para mantener el proceso corriendo:
   ```bash
   npm install -g pm2
   pm2 start "pnpm start" --name pathxpress
   pm2 startup
   pm2 save
   ```
7. Configura Nginx como reverse proxy:
   ```bash
   sudo apt install nginx
   ```
   
   Crea `/etc/nginx/sites-available/pathxpress`:
   ```nginx
   server {
       listen 80;
       server_name tudominio.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   
   Activa el sitio:
   ```bash
   sudo ln -s /etc/nginx/sites-available/pathxpress /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

8. Configura SSL con Let's Encrypt:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d tudominio.com
   ```

### Opción E: Netlify + Backend Separado

**Para Frontend:** Netlify (gratis, muy rápido)
**Para Backend:** Railway, Render, o Heroku

#### Pasos:

1. Separa el frontend y backend en repositorios diferentes
2. Despliega frontend en Netlify
3. Despliega backend en Railway/Render
4. Actualiza las URLs de API en el frontend

---

## 8. Configuración Post-Deployment

### Paso 8.1: Configurar Dominio Personalizado

#### En Vercel:
1. Ve a tu proyecto → Settings → Domains
2. Agrega tu dominio
3. Configura DNS según las instrucciones

#### En Railway:
1. Ve a Settings → Networking
2. Agrega custom domain
3. Configura CNAME en tu proveedor de DNS

### Paso 8.2: Configurar Email (Para notificaciones)

Si quieres enviar emails desde tu app:

1. Usa un servicio como:
   - SendGrid (100 emails/día gratis)
   - Mailgun
   - Amazon SES
   - Resend

2. Agrega credenciales al `.env`:
   ```env
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=tu-api-key
   ```

### Paso 8.3: Configurar Storage (Para archivos POD)

Para subir archivos (POD, documentos):

#### Opción 1: AWS S3
1. Crea bucket en S3
2. Configura permisos públicos
3. Agrega credenciales:
   ```env
   AWS_ACCESS_KEY_ID=tu-key
   AWS_SECRET_ACCESS_KEY=tu-secret
   AWS_REGION=us-east-1
   AWS_BUCKET_NAME=pathxpress-files
   ```

#### Opción 2: Cloudflare R2 (Compatible con S3, más barato)
1. Crea cuenta en Cloudflare
2. Ve a R2 y crea un bucket
3. Usa las mismas variables que S3

### Paso 8.4: Monitoreo y Logs

#### Sentry (para errores)
1. Crea cuenta en: https://sentry.io/
2. Instala SDK:
   ```bash
   pnpm add @sentry/node @sentry/react
   ```
3. Configura en `server/_core/index.ts` y `client/src/main.tsx`

#### LogTail (para logs)
1. Crea cuenta en: https://logtail.com/
2. Agrega token al `.env`

---

## 9. Mantenimiento y Actualizaciones

### Actualizar Dependencias

```bash
# Ver paquetes desactualizados
pnpm outdated

# Actualizar todos
pnpm update

# Actualizar uno específico
pnpm update react
```

### Hacer Backup de Base de Datos

#### MySQL Local:
```bash
mysqldump -u root -p pathxpress > backup.sql
```

#### Restaurar:
```bash
mysql -u root -p pathxpress < backup.sql
```

### Migrar Esquema de Base de Datos

Cuando cambies `drizzle/schema.ts`:

```bash
# Generar migración
pnpm drizzle-kit generate

# Aplicar migración
pnpm db:push
```

### CI/CD Automático

Configura GitHub Actions para deployment automático:

Crea `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
      # Agrega paso de deployment según tu hosting
```

---

## 🔧 Troubleshooting Común

### Error: "Cannot connect to database"
- Verifica que `DATABASE_URL` esté correcta
- Asegúrate que el servidor de BD esté corriendo
- Revisa firewall/security groups

### Error: "Module not found"
- Ejecuta `pnpm install` de nuevo
- Borra `node_modules` y reinstala

### Error: "Port already in use"
- Cambia el `PORT` en `.env`
- O mata el proceso: `lsof -ti:3000 | xargs kill`

### Frontend no se conecta al Backend
- Verifica CORS en `server/_core/index.ts`
- Asegúrate que las URLs coincidan

---

## 📚 Recursos Adicionales

- **Documentación de Drizzle ORM:** https://orm.drizzle.team/
- **Documentación de tRPC:** https://trpc.io/
- **Documentación de React:** https://react.dev/
- **Documentación de Vite:** https://vitejs.dev/

---

## 🆘 Soporte

Si tienes problemas durante el deployment:

1. Revisa los logs del servidor
2. Verifica las variables de entorno
3. Consulta la documentación de tu proveedor de hosting
4. Busca el error específico en Google/Stack Overflow

---

**¡Éxito con tu deployment!** 🚀
