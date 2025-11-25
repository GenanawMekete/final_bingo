const mongoose = require('mongoose');

async function run() {
  console.log('Creating bingocards collection...');
  
  const db = mongoose.connection.db;
  
  // Create bingocards collection if it doesn't exist
  const collections = await db.listCollections({ name: 'bingocards' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('bingocards');
    console.log('✅ BingoCards collection created');
  } else {
    console.log('⏭️ BingoCards collection already exists');
  }
  
  // Create indexes
  await db.collection('bingocards').createIndex({ cardId: 1 }, { unique: true });
  await db.collection('bingocards').createIndex({ player: 1 });
  await db.collection('bingocards').createIndex({ game: 1 });
  
  console.log('✅ BingoCards indexes created');
}

module.exports = {
  name: '004_create_bingocards',
  run
};
