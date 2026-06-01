import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
console.log("envPath:", envPath);

const result = config({ path: envPath });
console.log("dotenv loaded:", result.parsed ? Object.keys(result.parsed).join(", ") : "FAILED");
console.log("DEEPSEEK_API_KEY exists:", !!process.env.DEEPSEEK_API_KEY);
