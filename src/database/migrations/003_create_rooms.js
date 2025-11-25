const mongoose = require('mongoose');

async function run() {
  console.log('Creating rooms collection...');
  
  const db = mongoose.connection.db;
  
  // Create rooms collection if it doesn't exist
  const collections = await db.listCollections({ name: 'rooms' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('rooms');
    console.log('✅ Rooms collection created');
  } else {
    console.log('⏭️ Rooms collection already exists');
  }
  
  // Create indexes
  await db.collection('rooms').createIndex({ roomId: 1 }, { unique: true });
  await db.collection('rooms').createIndex({ status: 1 });
  await db.collection('rooms').createIndex({ 'config.type': 1 });
  
  console.log('✅ Rooms indexes created');
}

module.exports = {
  name: '003_create_rooms',
  run
};
