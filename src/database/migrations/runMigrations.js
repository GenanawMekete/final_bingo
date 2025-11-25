const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { MONGODB_URI, databaseConfig } = require('../../config/database');

class MigrationManager {
  constructor() {
    this.migrations = [];
  }

  async connect() {
    try {
      await mongoose.connect(MONGODB_URI, databaseConfig);
      console.log('✅ Connected to MongoDB for migrations');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect() {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }

  async loadMigrations() {
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js') && file !== 'runMigrations.js')
      .sort();

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      try {
        const migration = require(migrationPath);
        if (migration.name && typeof migration.run === 'function') {
          this.migrations.push(migration);
          console.log(`📁 Loaded migration: ${migration.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load migration ${file}:`, error);
      }
    }
  }

  async runMigrations() {
    await this.connect();
    const db = mongoose.connection.db;

    try {
      // Ensure migrations collection exists
      const collections = await db.listCollections({ name: 'migrations' }).toArray();
      if (collections.length === 0) {
        await db.createCollection('migrations');
        console.log('📁 Created migrations collection');
      }

      // Get executed migrations
      const executedMigrations = await db.collection('migrations').find({}).toArray();
      const executedNames = new Set(executedMigrations.map(m => m.name));

      let executedCount = 0;
      
      for (const migration of this.migrations) {
        if (!executedNames.has(migration.name)) {
          console.log(`🔄 Running: ${migration.name}`);
          
          try {
            await migration.run.call({ db });
            await db.collection('migrations').insertOne({
              name: migration.name,
              executedAt: new Date()
            });
            executedCount++;
            console.log(`✅ Completed: ${migration.name}`);
          } catch (error) {
            console.error(`❌ Failed: ${migration.name}`, error);
            throw error;
          }
        } else {
          console.log(`⏭️ Already executed: ${migration.name}`);
        }
      }

      if (executedCount === 0) {
        console.log('🎉 All migrations are up to date!');
      } else {
        console.log(`🎉 Migrations completed! Executed ${executedCount} migration(s).`);
      }
      
    } finally {
      await this.disconnect();
    }
  }

  async listMigrations() {
    await this.connect();
    const db = mongoose.connection.db;

    try {
      const executedMigrations = await db.collection('migrations').find({}).toArray();
      const executedNames = new Set(executedMigrations.map(m => m.name));

      console.log('📋 Migration Status:');
      console.log('===================');
      
      for (const migration of this.migrations) {
        const executed = executedMigrations.find(m => m.name === migration.name);
        const status = executed ? '✅ Executed' : '⏳ Pending';
        const date = executed ? `(${executed.executedAt.toISOString()})` : '';
        console.log(`${status}: ${migration.name} ${date}`);
      }
      
    } finally {
      await this.disconnect();
    }
  }
}

// CLI handling
async function main() {
  const command = process.argv[2];
  const migrationManager = new MigrationManager();
  
  await migrationManager.loadMigrations();

  try {
    switch (command) {
      case 'run':
        await migrationManager.runMigrations();
        break;
      case 'list':
        await migrationManager.listMigrations();
        break;
      default:
        console.log('Usage: node runMigrations.js [run|list]');
        console.log('  run  - Execute pending migrations');
        console.log('  list - List migration status');
    }
  } catch (error) {
    console.error('Migration process failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = MigrationManager;
