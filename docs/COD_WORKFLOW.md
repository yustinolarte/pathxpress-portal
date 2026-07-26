# COD (Cash on Delivery) - Flujo Completo

## ¿Qué es COD?

COD (Cash on Delivery) es un servicio donde el courier cobra dinero al destinatario en el momento de la entrega y luego remite ese dinero al cliente (remitente).

---

## Cómo Funciona en PATHXPRESS

### 1. **Creación de Envío con COD**

Cuando un cliente crea un envío en su portal:

1. Marca el checkbox "COD Required"
2. Ingresa el monto a cobrar (ej: 500 AED)
3. El sistema calcula automáticamente el **COD Fee** (3.3% del monto, mínimo 2 AED)
4. Se crea:
   - Un registro en `orders` (el envío)
   - Un registro en `codRecords` vinculado al `shipmentId`

**Ejemplo:**
```
Envío: PX-2025-00123
COD Amount: 500 AED
COD Fee: 16.50 AED (3.3% de 500)
Total a cobrar al destinatario: 500 AED
Fee que paga el cliente: 16.50 AED
```

---

### 2. **Tabla de COD Records** (actualizado — refleja `drizzle/schema.ts`)

Cada envío COD crea un registro en `codRecords` con:

```typescript
{
  id: 1,
  shipmentId: 123,             // FK a orders.id
  codAmount: "500.00",         // Monto a cobrar
  codCurrency: "AED",
  allowedMethods: "cash",      // 'cash' | 'card' | 'any' — lo que el shipper permite
  collectedMethod: null,       // 'cash' | 'card' — lo que realmente pasó en la puerta
  feeAmount: null,              // Fee congelado al momento de cobrar (depende del método)
  paymentReference: null,
  status: "pending_collection", // pending_collection | collected | remitted | disputed | cancelled
  collectedDate: null,
  remittedToClientDate: null,
  notes: null,
  createdAt: "2025-01-15",
}
```

Nota: además de COD en efectivo, existe **CCOD (Card on Delivery)** — el driver cobra con Tap to Pay en su teléfono. Es el mismo registro (`codRecords`), pero `collectedMethod: 'card'` y el fee se calcula con `CARD_FEE_PERCENTAGE`/`CARD_MIN_FEE` en vez de los de cash.

---

### 3. **Estados del COD**

1. **pending_collection**: Envío creado, aún no se ha cobrado
2. **collected**: El courier cobró el dinero (o card) al destinatario
3. **remitted**: El dinero fue incluido en una remesa y pagado al cliente
4. **disputed**: Marcado para revisión manual
5. **cancelled**: COD desactivado en la orden (ej. se quitó el COD) — no cuenta en ninguna vista de COD Management/Customer COD

---

### 4. **Proceso de Remesas (Admin)**

El administrador agrupa múltiples cobros COD en **remesas**:

1. Va a Admin → COD Management
2. Ve lista de COD pendientes por cliente
3. Crea una remesa seleccionando CODs de un cliente
4. Registra el pago de la remesa
5. Los COD cambian a estado "remitted"

**Tabla `codRemittances`** (actualizado):
```typescript
{
  id: 1,
  clientId: 5,
  remittanceNumber: "REM-2025-001",
  grossAmount: "1500.00",     // Suma de los codAmount incluidos
  feeAmount: "49.50",         // Suma de los feeAmount (COD/CCOD) descontados
  feePercentage: "3.3",
  totalAmount: "1450.50",     // grossAmount - feeAmount = lo que realmente se transfiere al cliente
  currency: "AED",
  shipmentCount: 10,
  status: "pending",          // pending | processed | completed
  paymentMethod: null,
  paymentReference: null,
  processedDate: null,
  createdBy: "admin@pathxpress.net",
}
```
Los CODs individuales de una remesa se vinculan vía la tabla `codRemittanceItems` (no hay un `remittanceId` directo en `codRecords`).

**Ojo con monedas mixtas:** `createRemittance` no valida que todos los `codRecords` seleccionados tengan la misma `codCurrency` — si se mezclan, la remesa queda etiquetada con la moneda del primer registro sin conversión. En la práctica casi todo es AED (COD internacional está bloqueado desde el checkout de Shopify), pero si aparece algún registro histórico en otra moneda, revisarlo a mano antes de crear la remesa.

---

### 5. **Vista del Cliente**

En Customer Portal → COD:

- **Pending COD Collections**: Lista de envíos COD que aún no se han cobrado
- **Remittances**: Lista de remesas recibidas con detalle de qué CODs incluye
- **Summary Cards**: Total pendiente, total remitido, etc.

---

## Integración con Órdenes

### Actualmente:

- El COD está vinculado por `shipmentId` en `codRecords`
- En la tabla de órdenes NO se muestra si es COD ni el monto
- En el waybill/guía NO aparece el COD

### Lo que falta mejorar:

1. **En tabla de órdenes**: Agregar columna "COD" que muestre:
   - ✅ COD: 500 AED (si tiene COD)
   - ❌ No COD (si no tiene)

2. **En waybill PDF**: Mostrar claramente:
   ```
   ⚠️ CASH ON DELIVERY
   Amount to collect: AED 500.00
   ```

3. **En detalles de envío**: Mostrar:
   - COD Amount
   - COD Fee
   - Collection Status

---

## Cálculo de COD Fee

**Fórmula:**
```
COD Fee = max(COD Amount × 3.3%, 2 AED)
```

**Ejemplos:**
- COD 50 AED → Fee = 2 AED (mínimo)
- COD 100 AED → Fee = 3.30 AED
- COD 500 AED → Fee = 16.50 AED
- COD 1000 AED → Fee = 33.00 AED

---

## Flujo Completo (Ejemplo Real)

### Día 1: Cliente crea envío
```
Cliente: ABC Trading LLC
Envío: PX-2025-00123
Destinatario: Mohammed Ali
COD Amount: 500 AED
COD Fee: 16.50 AED
Status: pending
```

### Día 2: Courier entrega y cobra
```
Courier entrega el paquete
Cobra 500 AED del destinatario
Admin marca COD como "collected"
```

### Día 7: Admin crea remesa
```
Admin agrupa 10 CODs del cliente ABC Trading:
- PX-2025-00123: 500 AED
- PX-2025-00124: 300 AED
- ... (8 más)
Total Remesa: 4,500 AED

Crea remesa REM-2025-001
```

### Día 10: Admin paga remesa
```
Admin transfiere 4,500 AED a ABC Trading
Marca remesa como "paid"
Todos los CODs cambian a "remitted"
```

### Cliente ve en su portal:
```
COD Tab:
- Pending: 2,100 AED (otros envíos)
- Remitted: 4,500 AED (REM-2025-001 - Paid)
```

---

## Archivos Clave del Sistema

### Backend:
- `drizzle/schema.ts` - Tablas `codRecords`, `codRemittances`, `codRemittanceItems` (no existe `codTransactions`)
- `server/db.ts` - Funciones `calculateCODFee`, `calculateCardCODFee`, `createRemittance`, etc.
- `server/portalRouters.ts` - Router `cod` con endpoints

### Frontend:
- `client/src/components/CODPanel.tsx` - Panel de admin
- `client/src/components/CustomerCODPanel.tsx` - Panel de cliente
- `client/src/pages/portal/CustomerDashboard.tsx` - Formulario de creación con COD

---

## Próximas Mejoras Sugeridas

1. ✅ Mostrar indicador COD en tabla de órdenes
2. ✅ Agregar COD info en waybill PDF
3. ✅ Mostrar COD fee en calculadora de tarifas
4. ⏳ Notificaciones automáticas cuando se paga una remesa
5. ⏳ Reporte de COD exportable a Excel

---

## Preguntas Frecuentes

**¿Quién paga el COD Fee?**
El cliente (remitente) paga el fee, no el destinatario.

**¿Cuándo se cobra el COD Fee?**
**No se incluye en la factura mensual de shipping.** El fee se descuenta directamente al momento de crear la remesa: se le transfiere al cliente `grossAmount - feeAmount`, nunca el monto completo cobrado. El fee de COD/CCOD y el costo de envío son dos flujos de dinero completamente separados — no hay ninguna línea de "COD Fee" en el invoice de `server/db.ts` (`generateInvoiceForClient`).

**¿Qué pasa si el destinatario no paga?**
El envío se devuelve y el COD queda como "pending". No se cobra el COD amount pero sí el costo del envío.

**¿Se puede cambiar el COD amount después de crear el envío?**
Actualmente no, pero se puede agregar esta funcionalidad en el futuro.
