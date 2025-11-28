import 'dotenv/config';
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { rateTiers, serviceConfig } from "../drizzle/schema";

// 1) Crear la conexión usando DATABASE_URL
const connection = await mysql.createConnection(process.env.DATABASE_URL!);

// 2) Pasar la conexión a drizzle (NO la URL)
const db = drizzle(connection);


async function seedRates() {
  console.log("Seeding rate tiers...");

  // DOM (Domestic Express) rates based on volume
  const domRates = [
    { minVolume: 0, maxVolume: 399, baseRate: "14.00", additionalKgRate: "1.00" },
    { minVolume: 400, maxVolume: 499, baseRate: "14.00", additionalKgRate: "1.00" },
    { minVolume: 500, maxVolume: 599, baseRate: "11.00", additionalKgRate: "1.00" },
    { minVolume: 600, maxVolume: 699, baseRate: "10.00", additionalKgRate: "1.00" },
    { minVolume: 700, maxVolume: 799, baseRate: "9.50", additionalKgRate: "1.00" },
    { minVolume: 800, maxVolume: 899, baseRate: "9.00", additionalKgRate: "1.00" },
    { minVolume: 900, maxVolume: null, baseRate: "8.00", additionalKgRate: "1.00" },
  ];

  for (const rate of domRates) {
    await db.insert(rateTiers).values({
      serviceType: "DOM",
      minVolume: rate.minVolume,
      maxVolume: rate.maxVolume,
      baseRate: rate.baseRate,
      additionalKgRate: rate.additionalKgRate,
      maxWeight: 5,
      isActive: 1,
    });
  }

  // SDD (Same Day Delivery) rates
  await db.insert(rateTiers).values({
    serviceType: "SDD",
    minVolume: 0,
    maxVolume: null,
    baseRate: "18.00",
    additionalKgRate: "1.00",
    maxWeight: 10,
    isActive: 1,
  });

  console.log("Seeding service configuration...");

  // Service configuration
  const configs = [
    {
      configKey: "COD_FEE_PERCENTAGE",
      configValue: "3.3",
      description: "COD fee percentage (3.3% of collected value)",
    },
    {
      configKey: "COD_MIN_FEE",
      configValue: "2.00",
      description: "Minimum COD fee in AED",
    },
    {
      configKey: "SDD_CUT_OFF_TIME",
      configValue: "14:00",
      description: "Same-day delivery cut-off time",
    },
    {
      configKey: "SDD_MIN_SHIPMENTS",
      configValue: "4",
      description: "Minimum shipments per collection for same-day service",
    },
    {
      configKey: "COMPANY_PHONE",
      configValue: "+971522803433",
      description: "Company contact phone number",
    },
    {
      configKey: "COMPANY_EMAIL_DOMAIN",
      configValue: "@pathxpress.net",
      description: "Company email domain",
    },
  ];

  for (const config of configs) {
    await db.insert(serviceConfig).values(config);
  }

  console.log("✅ Rate seeding completed successfully!");
}

seedRates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error seeding rates:", error);
    process.exit(1);
  });
