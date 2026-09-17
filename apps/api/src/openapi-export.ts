import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.js";

// Dump the OpenAPI schema for frontend codegen (step 1 of contract sync).
const app = createApp();
const doc = app.getOpenAPIDocument({
  openapi: "3.0.0",
  info: { title: "ClockWise API", version: "0.0.0" },
});

const out = process.argv[2] ? resolve(process.argv[2]) : resolve("openapi.json");
writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(`Wrote OpenAPI schema to ${out}`);
