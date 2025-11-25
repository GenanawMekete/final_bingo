const mongoose = require('mongoose');

async function run() {
  console.log('Creating sample rooms...');
  
  // Define a simple room schema for this seeder
  const RoomSchema = new mongoose.Schema({
    roomId: String,
    name: String,
    description: String,
    config: Object,
    status: String
  });
  
  const Room = mongoose.model('Room', RoomSchema);
  
  // Check if sample rooms already exist
  const existingRooms = await Room.find({ name: { $in: ['Quick Play', 'Pro League', 'Free Entry'] } });
  if (existingRooms.length > 0) {
    console.log('⏭️  Sample rooms already exist');
    return;
  }

  const sampleRooms = [
    {
      name: 'Quick Play',
      description: 'Fast-paced 30-second games for quick fun!',
      config: {
        type: 'public',
        maxPlayers: 50,
        gameDuration: 30,
        entryFee: 0,
        autoStart: true,
        minPlayersToStart: 2
      },
      status: 'waiting'
    },
    {
      name: 'Pro League',
      description: 'Competitive games with entry fees and bigger prizes',
      config: {
        type: 'public',
        maxPlayers: 25,
        gameDuration: 45,
        entryFee: 10,
        prizePool: 250,
        autoStart: true,
        minPlayersToStart: 4
      },
      status: 'waiting'
    },
    {
      name: 'Free Entry',
      description: 'Practice and learn the game with no entry fee',
      config: {
        type: 'public',
        maxPlayers: 100,
        gameDuration: 60,
        entryFee: 0,
        autoStart: false,
        minPlayersToStart: 2
      },
      status: 'waiting'
    }
  ];

  for (const roomData of sampleRooms) {
    const room = new Room({
      ...roomData,
      roomId: `SAMPLE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    });
    
    await room.save();
    console.log(`✅ Created room: ${roomData.name}`);
  }

  console.log('🎉 Sample rooms created successfully');
}

module.exports = {
  name: 'sampleRooms',
  run
};
