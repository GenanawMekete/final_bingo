const mongoose = require('mongoose');

async function run() {
  console.log('Creating transactions collection...');
  
  const db = mongoose.connection.db;
  
  // Create transactions collection if it doesn't exist
  const collections = await db.listCollections({ name: 'transactions' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('transactions');
    console.log('✅ Transactions collection created');
  } else {
    console.log('⏭️ Transactions collection already exists');
  }
  
  // Create indexes
  await db.collection('transactions').createIndex({ transactionId: 1 }, { unique: true });
  await db.collection('transactions').createIndex({ player: 1 });
  await db.collection('transactions').createIndex({ type: 1 });
  
  console.log('✅ Transactions indexes created');
}

module.exports = {
  name: '005_create_transactions',
  run
};
