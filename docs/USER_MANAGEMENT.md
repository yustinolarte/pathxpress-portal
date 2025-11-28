# PATHXPRESS - Guía de Gestión de Usuarios

Esta guía explica cómo agregar y gestionar usuarios en el sistema de portales de PATHXPRESS (administradores y clientes).

## Tabla de Contenidos

1. [Tipos de Usuarios](#tipos-de-usuarios)
2. [Agregar Nuevos Usuarios](#agregar-nuevos-usuarios)
3. [Gestión de Contraseñas](#gestión-de-contraseñas)
4. [Gestión de Clientes](#gestión-de-clientes)
5. [Solución de Problemas](#solución-de-problemas)

---

## Tipos de Usuarios

El sistema PATHXPRESS tiene dos tipos de usuarios:

### 1. **Administradores (Admin)**
- Acceso completo al sistema
- Pueden ver y gestionar todos los clientes
- Pueden ver y gestionar todos los envíos
- Pueden generar y editar facturas
- Pueden cambiar estados de facturas y envíos
- **Portal de acceso:** `/portal/admin`

### 2. **Clientes (Customer)**
- Acceso limitado a sus propios datos
- Pueden crear nuevos envíos
- Pueden ver sus propios envíos
- Pueden ver sus facturas
- Pueden descargar etiquetas de envío (waybills)
- **Portal de acceso:** `/portal/customer`

---

## Agregar Nuevos Usuarios

Existen dos métodos para agregar usuarios:

### Método 1: Usar el Script de Gestión (Recomendado)

Este es el método más fácil y seguro para crear usuarios.

#### Paso 1: Editar el Script

Abre el archivo `scripts/manage-users.ts` y modifica la función `main()` con los datos del nuevo usuario:

```typescript
async function main() {
  console.log('🚀 PATHXPRESS User Management Script\n');
  
  // Para crear un ADMINISTRADOR:
  await createUser({
    email: 'admin@tuempresa.com',
    password: 'contraseña_segura_123',
    role: 'admin',
    name: 'Nombre del Administrador',
  });
  
  // Para crear un CLIENTE:
  await createUser({
    email: 'cliente@empresa.com',
    password: 'contraseña_cliente_123',
    role: 'customer',
    name: 'Nombre del Cliente',
    companyName: 'Nombre de la Empresa LLC',
    billingAddress: 'Oficina 123, Torre de Negocios, Dubai',
    billingEmail: 'facturacion@empresa.com',
    paymentTerms: 30, // Días de crédito
    currency: 'AED', // Moneda (AED, USD, EUR, etc.)
  });
  
  process.exit(0);
}
```

#### Paso 2: Ejecutar el Script

Desde la terminal, ejecuta:

```bash
cd /home/ubuntu/pathxpress
pnpm tsx scripts/manage-users.ts
```

#### Paso 3: Verificar

El script mostrará un mensaje de éxito con las credenciales creadas:

```
✅ User created successfully!
   Email: cliente@empresa.com
   Password: contraseña_cliente_123
   Role: customer
```

**⚠️ IMPORTANTE:** Guarda estas credenciales de forma segura y compártelas con el usuario.

---

### Método 2: Inserción Directa en Base de Datos (Avanzado)

**⚠️ NO RECOMENDADO:** Este método requiere hashear manualmente las contraseñas y puede causar errores.

Si necesitas usar este método, sigue estos pasos:

#### Paso 1: Hashear la Contraseña

```bash
cd /home/ubuntu/pathxpress
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('tu_contraseña', 10, (err, hash) => console.log(hash));"
```

#### Paso 2: Insertar en la Base de Datos

Usa el panel de gestión de base de datos en la interfaz de Manus o ejecuta SQL directamente:

```sql
-- Crear usuario administrador
INSERT INTO portalUsers (email, password, role, name, createdAt, updatedAt)
VALUES ('admin@example.com', '$2b$10$HASH_GENERADO_AQUI', 'admin', 'Admin Name', NOW(), NOW());

-- Crear usuario cliente (primero crear el usuario, luego la cuenta de cliente)
INSERT INTO portalUsers (email, password, role, name, createdAt, updatedAt)
VALUES ('customer@example.com', '$2b$10$HASH_GENERADO_AQUI', 'customer', 'Customer Name', NOW(), NOW());

-- Obtener el ID del usuario recién creado y crear la cuenta de cliente
INSERT INTO clientAccounts (companyName, billingAddress, billingEmail, paymentTerms, currency, creditLimit, currentBalance, status, portalUserId, createdAt, updatedAt)
VALUES ('Company Name LLC', 'Address', 'billing@example.com', 30, 'AED', '0', '0', 'active', USER_ID_AQUI, NOW(), NOW());
```

---

## Gestión de Contraseñas

### Cambiar Contraseña de un Usuario

#### Opción 1: Usando el Script (Próximamente)

_Esta funcionalidad se agregará en una futura actualización._

#### Opción 2: Manualmente en Base de Datos

1. Hashea la nueva contraseña:
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('nueva_contraseña', 10, (err, hash) => console.log(hash));"
```

2. Actualiza en la base de datos:
```sql
UPDATE portalUsers 
SET password = '$2b$10$NUEVO_HASH_AQUI', updatedAt = NOW()
WHERE email = 'usuario@example.com';
```

### Recuperación de Contraseña

**⚠️ PENDIENTE:** El sistema de recuperación de contraseñas por email aún no está implementado.

Por ahora, para recuperar acceso:
1. Contacta al administrador del sistema
2. El administrador puede cambiar la contraseña usando los métodos anteriores

---

## Gestión de Clientes

### Datos Importantes del Cliente

Cuando creas un cliente, asegúrate de configurar correctamente:

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `companyName` | Nombre legal de la empresa | "Tech Solutions LLC" |
| `billingAddress` | Dirección de facturación | "Office 301, Business Bay Tower, Dubai" |
| `billingEmail` | Email para facturas | "billing@techsolutions.ae" |
| `paymentTerms` | Días de crédito | 30 (días) |
| `currency` | Moneda de facturación | "AED", "USD", "EUR" |
| `creditLimit` | Límite de crédito | "10000.00" |
| `status` | Estado de la cuenta | "active", "suspended", "inactive" |

### Modificar Datos de un Cliente

Para modificar datos de un cliente existente:

```sql
UPDATE clientAccounts
SET 
  companyName = 'Nuevo Nombre',
  billingAddress = 'Nueva Dirección',
  paymentTerms = 45,
  currency = 'USD',
  updatedAt = NOW()
WHERE id = CLIENT_ID;
```

### Desactivar un Cliente

```sql
UPDATE clientAccounts
SET status = 'inactive', updatedAt = NOW()
WHERE id = CLIENT_ID;
```

### Reactivar un Cliente

```sql
UPDATE clientAccounts
SET status = 'active', updatedAt = NOW()
WHERE id = CLIENT_ID;
```

---

## Solución de Problemas

### Problema: No puedo iniciar sesión

**Posibles causas:**
1. Contraseña incorrecta
2. Email mal escrito
3. Usuario no existe en la base de datos
4. Contraseña no fue hasheada correctamente

**Solución:**
1. Verifica que el email sea exactamente el mismo (case-sensitive)
2. Si usaste inserción manual, asegúrate de haber hasheado la contraseña
3. Usa el script de gestión para recrear el usuario

### Problema: Cliente no puede ver sus envíos

**Posibles causas:**
1. El usuario no tiene una cuenta de cliente asociada (`clientAccounts`)
2. El `portalUserId` en `clientAccounts` no coincide con el ID del usuario

**Solución:**
```sql
-- Verificar la relación
SELECT u.id as userId, u.email, c.id as clientId, c.companyName
FROM portalUsers u
LEFT JOIN clientAccounts c ON c.portalUserId = u.id
WHERE u.email = 'cliente@example.com';

-- Si no hay clientAccount, crear uno
INSERT INTO clientAccounts (companyName, billingEmail, paymentTerms, currency, creditLimit, currentBalance, status, portalUserId, createdAt, updatedAt)
VALUES ('Company Name', 'email@example.com', 30, 'AED', '0', '0', 'active', USER_ID, NOW(), NOW());
```

### Problema: Error "Database not available"

**Causa:** La conexión a la base de datos no está configurada correctamente.

**Solución:**
1. Verifica que la variable de entorno `DATABASE_URL` esté configurada
2. Reinicia el servidor de desarrollo
3. Verifica que la base de datos esté accesible

---

## Usuarios de Ejemplo (Desarrollo)

Para pruebas y desarrollo, el sistema incluye estos usuarios:

### Administrador
- **Email:** admin@pathxpress.ae
- **Password:** admin123
- **Portal:** https://tu-dominio.com/portal/admin

### Cliente de Prueba
- **Email:** customer@techsolutions.ae
- **Password:** customer123
- **Portal:** https://tu-dominio.com/portal/customer
- **Empresa:** Tech Solutions LLC

**⚠️ IMPORTANTE:** Cambia estas contraseñas en producción.

---

## Mejores Prácticas

1. **Contraseñas Seguras:** Usa contraseñas de al menos 12 caracteres con letras, números y símbolos
2. **Emails Únicos:** Cada usuario debe tener un email único
3. **Documentación:** Mantén un registro de los usuarios creados
4. **Permisos:** Asigna el rol correcto (admin vs customer)
5. **Pruebas:** Siempre prueba el login después de crear un usuario
6. **Backup:** Haz backup de la base de datos antes de modificaciones masivas

---

## Contacto y Soporte

Para soporte adicional o preguntas sobre gestión de usuarios, contacta al equipo de desarrollo de PATHXPRESS.

---

**Última actualización:** Noviembre 2025
