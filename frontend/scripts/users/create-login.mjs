#!/usr/bin/env node
// Creates (or resets) an email + password login with a role. Prints the
// password once; it is stored only as a bcrypt hash.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/users/create-login.mjs <email> "<name>" <role> [--allow-prod]
// Roles: owner | finance | pm | readonly | legal | billing

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [email, name, role] = args;
const allowProd = process.argv.includes("--allow-prod");
const ROLES = ["owner", "finance", "pm", "readonly", "legal", "billing"];
if (!email || !name || !ROLES.includes(role)) { console.error("usage: create-login.mjs <email> \"<name>\" <role>"); process.exit(1); }
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (dbName === "margindesk_prod" && !allowProd) { console.error("Refusing to write to margindesk_prod without --allow-prod."); process.exit(1); }

// 14 characters from an unambiguous alphabet.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const password = Array.from(randomBytes(14), (b) => alphabet[b % alphabet.length]).join("");
const hash = await bcrypt.hash(password, 10);

const prisma = new PrismaClient();
const user = await prisma.user.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), name, role, password: hash, auth_provider: "credentials" },
  update: { name, role, password: hash, auth_provider: "credentials" },
});
console.log(`Database: ${dbName}`);
console.log(`Login: ${user.email}   role: ${user.role}`);
console.log(`Password: ${password}`);
await prisma.$disconnect();
