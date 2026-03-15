import 'dotenv/config';
import { getDb, getAllClientAccounts } from './server/db.js';

async function test() {
    try {
        console.log("Connecting to DB (using .env)...");
        const clients = await getAllClientAccounts();
        console.log("Clients found:", clients.length);
        if (clients.length > 0) {
            console.log("First client:", clients[0].companyName);
        } else {
            console.log("No clients found. Check server logs for errors.");
        }
    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        process.exit(0);
    }
}

test();
