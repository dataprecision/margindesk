import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding default exclusion rules...");

  // Check if default rules already exist
  const existingRules = await prisma.expenseExclusionRule.findMany({
    where: { is_default: true },
  });

  if (existingRules.length > 0) {
    console.log(`✅ Default rules already exist (${existingRules.length} rules). Skipping seed.`);
    return;
  }

  // Create default exclusion rules
  const defaultRules = [
    {
      name: "GST Payable",
      description: "Exclude GST payable transactions",
      enabled: true,
      field: "account_name",
      operator: "equals",
      value: "GST Payable",
      reason: "GST payable transaction - not a real expense",
      is_default: true,
    },
    {
      name: "Roundoff Adjustments",
      description: "Exclude roundoff adjustments",
      enabled: true,
      field: "account_name",
      operator: "equals",
      value: "Roundoff",
      reason: "Roundoff adjustment - accounting entry only",
      is_default: true,
    },
    {
      name: "Bank Charges (Forex)",
      description: "Exclude forex conversion charges from bank",
      enabled: true,
      field: "account_name",
      operator: "equals",
      value: "Bank Charges",
      reason: "Bank/forex charges - not operational expense",
      is_default: true,
    },
    {
      name: "Very Small Amounts",
      description: "Exclude expenses less than ₹1",
      enabled: true,
      field: "amount",
      operator: "less_than",
      value: "1",
      reason: "Amount too small - likely rounding difference",
      is_default: true,
    },
  ];

  for (const rule of defaultRules) {
    await prisma.expenseExclusionRule.create({
      data: rule as any,
    });
    console.log(`  ✓ Created rule: ${rule.name}`);
  }

  console.log("✅ Default exclusion rules seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding exclusion rules:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
