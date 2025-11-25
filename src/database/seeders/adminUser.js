const mongoose = require('mongoose');

async function run() {
  console.log('Creating admin user...');
  
  // Define a simple player schema for this seeder
  const PlayerSchema = new mongoose.Schema({
    telegramId: Number,
    telegramUsername: String,
    firstName: String,
    lastName: String,
    coins: Number,
    level: Number,
    experience: Number,
    referralCode: String
  });
  
  const Player = mongoose.model('Player', PlayerSchema);
  
  // Check if admin already exists
  const existingAdmin = await Player.findOne({ telegramId: 1 });
  if (existingAdmin) {
    console.log('⏭️  Admin user already exists');
    return;
  }

  // Create admin user
  const adminUser = new Player({
    telegramId: 1,
    telegramUsername: 'admin',
    firstName: 'Admin',
    lastName: 'User',
    coins: 10000,
    level: 100,
    experience: 10000,
    referralCode: 'ADMIN001'
  });

  await adminUser.save();
  
  console.log('✅ Admin user created successfully');
  console.log('   👤 Username: admin');
  console.log('   💰 Coins: 10,000');
  console.log('   🎯 Level: 100');
}

module.exports = {
  name: 'adminUser',
  run
};
