const express = require('express');
const router = express.Router();

// GET /api/rooms - Get available rooms
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Get available rooms',
    data: []
  });
});

// POST /api/rooms - Create a new room
router.post('/', (req, res) => {
  res.status(201).json({
    status: 'success',
    message: 'Room created successfully',
    data: { roomId: 'room_' + Date.now() }
  });
});

module.exports = router;
