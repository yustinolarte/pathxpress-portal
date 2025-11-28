import { drizzle } from "drizzle-orm/mysql2";
import { readFileSync } from "fs";
import { join } from "path";

async function applyMigration() {
    const db = drizzle(process.env.DATABASE_URL!);

    try {
        const sql = readFileSync(join(__dirname, '../drizzle/0011_mute_mister_sinister.sql'), 'utf-8');

        console.log('Applying migration: 0011_mute_mister_sinister.sql');
        console.log('SQL:', sql);

        // Execute the SQL
        await db.execute(sql);

        console.log('✅ Migration applied successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

applyMigration()
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
    });
