const express = require('express');
const router = express.Router();

// Import API routes
router.use('/games', require('./gameRoutes'));
router.use('/players', require('./playerRoutes'));
router.use('/rooms', require('./roomRoutes'));
router.use('/admin', require('./adminRoutes'));

// Default API route
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Bingo Game API',
    version: '1.0.0',
    endpoints: {
      games: '/api/games',
      players: '/api/players',
      rooms: '/api/rooms',
      admin: '/api/admin'
    }
  });
});

module.exports = router;
