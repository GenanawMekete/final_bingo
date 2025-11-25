// backend/src/config/database.js
const mongoose = require('mongoose');

const connectDatabase = async () => {
  try {
    // Get MongoDB connection string from environment
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    // Validate connection string format
    if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB connection string. Must start with mongodb:// or mongodb+srv://');
    }

    console.log('🔗 Connecting to MongoDB...');
    
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    // More specific error handling
    if (error.name === 'MongoParseError') {
      console.error('💡 Tip: Check your MONGODB_URI format. It should start with mongodb:// or mongodb+srv://');
    } else if (error.name === 'MongoServerSelectionError') {
      console.error('💡 Tip: Check if your IP is whitelisted in MongoDB Atlas and credentials are correct');
    }
    
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

module.exports = { connectDatabase };
