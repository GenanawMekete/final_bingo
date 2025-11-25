const mongoose = require('mongoose');

async function run() {
  console.log('Creating games collection...');
  
  // Just create the collection and indexes - no need to define schema here
  // since the models will define the schema when the app runs
  
  const db = mongoose.connection.db;
  
  // Create games collection if it doesn't exist
  const collections = await db.listCollections({ name: 'games' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('games');
    console.log('✅ Games collection created');
  } else {
    console.log('⏭️ Games collection already exists');
  }
  
  // Create indexes
  await db.collection('games').createIndex({ gameId: 1 }, { unique: true });
  await db.collection('games').createIndex({ status: 1 });
  await db.collection('games').createIndex({ room: 1 });
  
  console.log('✅ Games indexes created');
}

module.exports = {
  name: '002_create_games',
  run
};
