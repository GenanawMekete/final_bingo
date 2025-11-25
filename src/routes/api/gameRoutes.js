const express = require('express');
const router = express.Router();

// GET /api/games - Get active games
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Get active games endpoint',
    data: []
  });
});

// GET /api/games/:id - Get specific game
router.get('/:id', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: `Get game ${req.params.id}`,
    data: { id: req.params.id }
  });
});

// POST /api/games/:id/join - Join a game
router.post('/:id/join', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: `Joined game ${req.params.id}`,
    data: { gameId: req.params.id }
  });
});

module.exports = router;
