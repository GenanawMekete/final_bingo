const express = require('express');
const router = express.Router();

// GET /api/players/:id - Get player profile
router.get('/:id', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: `Get player ${req.params.id}`,
    data: { id: req.params.id }
  });
});

// GET /api/players/:id/stats - Get player statistics
router.get('/:id/stats', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: `Get player ${req.params.id} stats`,
    data: { 
      id: req.params.id,
      gamesPlayed: 0,
      gamesWon: 0,
      coins: 100 
    }
  });
});

module.exports = router;
