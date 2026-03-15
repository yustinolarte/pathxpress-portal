import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { quote, loadRatesFromDB, QuoteInput } from "./internationalRateEngine";
import * as dotenv from "dotenv";
dotenv.config();

async function run() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);
    const db = drizzle(connection);

    console.log("Loading rates from DB...");
    const rateData = await loadRatesFromDB(db);
    console.log("Rates loaded.");

    const testWeights = [1.4, 1.5, 1.7];
    for (const w of testWeights) {
        console.log(`\n\n=== QUOTING FOR WEIGHT: ${w} kg ===`);
        const input: QuoteInput = {
            originCountry: "United Arab Emirates",
            destinationCountry: "United States", // US has ePackets usually
            realWeightKg: w,
            dimensionsCm: { length: 10, width: 10, height: 10 }
        };
        const result = quote(rateData, input);
        const epacketOptions = result.options.filter(o => o.serviceKey.startsWith("PRIME_"));
        if (epacketOptions.length > 0) {
            console.log(`✅ ePacket services found for ${w}kg:`);
            for (const opt of epacketOptions) {
                console.log(`   - ${opt.displayName}: ${opt.total} ${opt.currency} (Bracket: ${opt.bracketUsed.value}${opt.bracketUsed.unit})`);
            }
        } else {
            console.log(`❌ No ePacket services found for ${w}kg. Reasons:`, result.reasons);
        }
    }

    await connection.end();
}

run().catch(console.error);
