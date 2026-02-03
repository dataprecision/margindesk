const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function findBill() {
  try {
    const billId = '4929735000014275835';

    console.log(`🔍 Searching for bill: ${billId}`);

    const bill = await prisma.bill.findUnique({
      where: { zoho_bill_id: billId }
    });

    if (bill) {
      console.log('\n✅ Bill found in database:');
      console.log(`   Bill Number: ${bill.bill_number}`);
      console.log(`   Vendor: ${bill.vendor_name}`);
      console.log(`   Date: ${bill.bill_date}`);
      console.log(`   Total: ${bill.total}`);
      console.log(`   Status: ${bill.status}`);
      console.log(`   Expense Category: ${bill.cf_expense_category}`);
      console.log(`   Include in Calculation: ${bill.include_in_calculation}`);
    } else {
      console.log('\n❌ Bill not found in database');
      console.log('   This bill ID may not have been synced yet');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

findBill();
