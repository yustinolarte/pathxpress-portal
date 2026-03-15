/**
 * Seed script: Populate internationalRates and internationalCountryMaps tables
 * from the rate calculator JSON files.
 *
 * Usage: npx tsx scripts/seed-international-rates.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import { internationalRates, internationalCountryMaps } from "../drizzle/schema";
import primeRates from "../server/rates/prime_epackets.json";
import gccRates from "../server/rates/gcc_rates.json";
import premiumRates from "../server/rates/premium_zones_rates.json";
import countryMaps from "../server/rates/country_maps.json";

async function seed() {
    const db = drizzle(process.env.DATABASE_URL!);
    console.log("🌍 Seeding international rates...");

    // 1. Seed country maps
    const countries = (countryMaps as any).countries as Record<string, { zone?: string; primeEligible?: boolean; gccEligible?: boolean; riskFlag?: boolean }>;
    const countryRows = Object.entries(countries).map(([country, meta]) => ({
        country,
        zone: meta.zone || null,
        primeEligible: meta.primeEligible ? 1 : 0,
        gccEligible: meta.gccEligible ? 1 : 0,
        riskFlag: meta.riskFlag ? 1 : 0,
        isActive: 1,
    }));

    console.log(`  📌 Inserting ${countryRows.length} country maps...`);
    // Insert in batches of 50 to avoid query size limits
    for (let i = 0; i < countryRows.length; i += 50) {
        const batch = countryRows.slice(i, i + 50);
        await db.insert(internationalCountryMaps).values(batch as any);
    }

    // 2. Seed PRIME rates (e-packets)
    const primeData = (primeRates as any).rates as Record<string, Record<string, Record<string, number>>>;
    const primeRows: any[] = [];
    const serviceKeys = ["PRIME_EXPRESS", "PRIME_TRACKED", "PRIME_REGISTERED_POD"];

    for (const [country, services] of Object.entries(primeData)) {
        for (const serviceKey of serviceKeys) {
            const brackets = services[serviceKey];
            if (!brackets) continue;
            for (const [weightBracket, price] of Object.entries(brackets)) {
                primeRows.push({
                    rateType: "prime" as const,
                    country,
                    zone: null,
                    weightBracket,
                    serviceKey,
                    price: String(price),
                    isActive: 1,
                });
            }
        }
    }

    console.log(`  📦 Inserting ${primeRows.length} PRIME rate entries...`);
    for (let i = 0; i < primeRows.length; i += 100) {
        const batch = primeRows.slice(i, i + 100);
        await db.insert(internationalRates).values(batch);
    }

    // 3. Seed GCC rates
    const gccData = (gccRates as any).rates as Record<string, Record<string, number>>;
    const gccRows: any[] = [];

    for (const [country, brackets] of Object.entries(gccData)) {
        for (const [weightBracket, price] of Object.entries(brackets)) {
            gccRows.push({
                rateType: "gcc" as const,
                country,
                zone: null,
                weightBracket,
                serviceKey: "GCC",
                price: String(price),
                isActive: 1,
            });
        }
    }

    console.log(`  🏜️ Inserting ${gccRows.length} GCC rate entries...`);
    for (let i = 0; i < gccRows.length; i += 100) {
        const batch = gccRows.slice(i, i + 100);
        await db.insert(internationalRates).values(batch);
    }

    // 4. Seed Premium (zones) rates
    const premiumData = (premiumRates as any).rates as Record<string, Record<string, number>>;
    const premiumRows: any[] = [];

    for (const [zone, brackets] of Object.entries(premiumData)) {
        for (const [weightBracket, price] of Object.entries(brackets)) {
            premiumRows.push({
                rateType: "premium" as const,
                country: null,
                zone,
                weightBracket,
                serviceKey: "PREMIUM_EXPORT",
                price: String(price),
                isActive: 1,
            });
        }
    }

    console.log(`  ✈️ Inserting ${premiumRows.length} Premium rate entries...`);
    for (let i = 0; i < premiumRows.length; i += 100) {
        const batch = premiumRows.slice(i, i + 100);
        await db.insert(internationalRates).values(batch);
    }

    const totalRates = primeRows.length + gccRows.length + premiumRows.length;
    console.log(`\n✅ Seeding complete!`);
    console.log(`   ${countryRows.length} countries`);
    console.log(`   ${totalRates} rate entries`);
    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
