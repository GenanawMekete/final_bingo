const express = require('express');
const router = express.Router();

// GET /api/admin/stats - Get admin statistics
router.get('/stats', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Admin statistics',
    data: {
      totalPlayers: 0,
      totalGames: 0,
      activeGames: 0
    }
  });
});

module.exports = router;
