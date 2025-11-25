const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bingo-game';

const databaseConfig = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, databaseConfig);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = {
  MONGODB_URI,
  databaseConfig,
  connectDB
};
