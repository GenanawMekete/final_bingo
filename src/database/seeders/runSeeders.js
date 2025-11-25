const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { MONGODB_URI, databaseConfig } = require('../../config/database');

class SeederManager {
  constructor() {
    this.seeders = [];
  }

  async connect() {
    try {
      await mongoose.connect(MONGODB_URI, databaseConfig);
      console.log('✅ Connected to MongoDB for seeding');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect() {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }

  async loadSeeders() {
    const seedersDir = __dirname;
    const files = fs.readdirSync(seedersDir)
      .filter(file => file.endsWith('.js') && file !== 'runSeeders.js')
      .sort();

    for (const file of files) {
      const seederPath = path.join(seedersDir, file);
      try {
        const seeder = require(seederPath);
        if (seeder.name && typeof seeder.run === 'function') {
          this.seeders.push(seeder);
          console.log(`📁 Loaded seeder: ${seeder.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load seeder ${file}:`, error);
      }
    }
  }

  async runSeeders() {
    await this.connect();
    const db = mongoose.connection.db;

    try {
      // Ensure seeders collection exists
      const collections = await db.listCollections({ name: 'seeders' }).toArray();
      if (collections.length === 0) {
        await db.createCollection('seeders');
        console.log('📁 Created seeders collection');
      }

      // Get executed seeders
      const executedSeeders = await db.collection('seeders').find({}).toArray();
      const executedNames = new Set(executedSeeders.map(s => s.name));

      let executedCount = 0;
      
      for (const seeder of this.seeders) {
        if (!executedNames.has(seeder.name)) {
          console.log(`🌱 Running: ${seeder.name}`);
          
          try {
            await seeder.run.call({ db });
            await db.collection('seeders').insertOne({
              name: seeder.name,
              executedAt: new Date()
            });
            executedCount++;
            console.log(`✅ Completed: ${seeder.name}`);
          } catch (error) {
            console.error(`❌ Failed: ${seeder.name}`, error);
            throw error;
          }
        } else {
          console.log(`⏭️ Already executed: ${seeder.name}`);
        }
      }

      if (executedCount === 0) {
        console.log('🎉 All seeders are up to date!');
      } else {
        console.log(`🎉 Seeders completed! Executed ${executedCount} seeder(s).`);
      }
      
    } finally {
      await this.disconnect();
    }
  }

  async listSeeders() {
    await this.connect();
    const db = mongoose.connection.db;

    try {
      const executedSeeders = await db.collection('seeders').find({}).toArray();
      const executedNames = new Set(executedSeeders.map(s => s.name));

      console.log('📋 Seeder Status:');
      console.log('================');
      
      for (const seeder of this.seeders) {
        const executed = executedSeeders.find(s => s.name === seeder.name);
        const status = executed ? '✅ Executed' : '⏳ Pending';
        const date = executed ? `(${executed.executedAt.toISOString()})` : '';
        console.log(`${status}: ${seeder.name} ${date}`);
      }
      
    } finally {
      await this.disconnect();
    }
  }

  async resetSeeders() {
    await this.connect();
    const db = mongoose.connection.db;

    try {
      await db.collection('seeders').deleteMany({});
      console.log('🗑️ All seeder records have been reset');
    } finally {
      await this.disconnect();
    }
  }
}

// CLI handling
async function main() {
  const command = process.argv[2];
  const seederManager = new SeederManager();
  
  await seederManager.loadSeeders();

  try {
    switch (command) {
      case 'run':
        await seederManager.runSeeders();
        break;
      case 'list':
        await seederManager.listSeeders();
        break;
      case 'reset':
        await seederManager.resetSeeders();
        console.log('🔁 Seeders reset. You can now run them again.');
        break;
      default:
        console.log('Usage: node runSeeders.js [run|list|reset]');
        console.log('  run   - Execute pending seeders');
        console.log('  list  - List seeder status');
        console.log('  reset - Reset seeder records (allows re-running)');
    }
  } catch (error) {
    console.error('Seeder process failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SeederManager;
