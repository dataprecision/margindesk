// Test script to fetch detailed bill information
const fs = require('fs');
const path = require('path');

async function testBillDetail() {
  // Read the sample bill to get the bill_id
  const sampleBill = JSON.parse(fs.readFileSync('./bill-sample.json', 'utf8'));
  const billId = sampleBill.bill_id;

  console.log(`🔍 Fetching detailed bill info for: ${billId}`);

  // Get Zoho tokens (you'll need to provide these)
  // For now, let's construct the API call
  const apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  const organizationId = process.env.ZOHO_ORGANIZATION_ID;
  const accessToken = process.env.ZOHO_ACCESS_TOKEN;

  if (!organizationId || !accessToken) {
    console.error('❌ Missing environment variables. Please set:');
    console.error('   ZOHO_ORGANIZATION_ID');
    console.error('   ZOHO_ACCESS_TOKEN');
    console.error('\nYou can get these from the database or .env.local file');
    process.exit(1);
  }

  try {
    const response = await fetch(
      `${apiDomain}/books/v3/bills/${billId}?organization_id=${organizationId}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ API Error:', error);
      process.exit(1);
    }

    const data = await response.json();
    console.log('✅ Detailed bill data received');

    // Write to file
    fs.writeFileSync(
      path.join(__dirname, 'bill-detail-sample.json'),
      JSON.stringify(data.bill || data, null, 2)
    );

    console.log('📁 Detailed bill written to: bill-detail-sample.json');
    console.log('\n📋 Available fields:');
    console.log(Object.keys(data.bill || data));

    // Check for line_items and payments
    const bill = data.bill || data;
    if (bill.line_items) {
      console.log('\n✅ line_items found! Count:', bill.line_items.length);
      if (bill.line_items.length > 0) {
        console.log('   First line item keys:', Object.keys(bill.line_items[0]));
      }
    } else {
      console.log('\n❌ No line_items in response');
    }

    if (bill.payments) {
      console.log('\n✅ payments found! Count:', bill.payments.length);
      if (bill.payments.length > 0) {
        console.log('   First payment keys:', Object.keys(bill.payments[0]));
      }
    } else {
      console.log('\n❌ No payments in response');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testBillDetail();
