const express = require('express');
const router = express.Router();

// API routes
router.use('/api', require('./api'));

// Webhook routes
router.use('/webhook', require('./webhook'));

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Bingo Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
