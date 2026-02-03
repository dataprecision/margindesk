import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const predefinedProducts = [
  {
    id: 'prod_ga4',
    name: 'Google Analytics 4',
    type: 'reselling' as const,
    is_predefined: true,
    description: 'GA4 implementation and management',
  },
  {
    id: 'prod_dv360',
    name: 'Google DV360',
    type: 'reselling' as const,
    is_predefined: true,
    description: 'Display & Video 360',
  },
  {
    id: 'prod_cm360',
    name: 'Google CM360',
    type: 'reselling' as const,
    is_predefined: true,
    description: 'Campaign Manager 360',
  },
  {
    id: 'prod_adobe_analytics',
    name: 'Adobe Analytics',
    type: 'reselling' as const,
    is_predefined: true,
    description: 'Adobe Analytics platform',
  },
  {
    id: 'prod_adobe_target',
    name: 'Adobe Target',
    type: 'reselling' as const,
    is_predefined: true,
    description: 'Adobe Target personalization',
  },
  {
    id: 'prod_adobe_aam',
    name: 'Adobe Audience Manager',
    type: 'reselling' as const,
    is_predefined: true,
    description: 'Adobe Audience Manager DMP',
  },
];

async function main() {
  console.log('🌱 Seeding predefined products...');

  for (const product of predefinedProducts) {
    const result = await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
    console.log(`✅ Created/Updated: ${result.name}`);
  }

  console.log('✨ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding products:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
