const express = require('express');
const router = express.Router();

// Telegram webhook route
router.post('/telegram', (req, res) => {
  console.log('Telegram webhook received:', req.body);
  res.status(200).json({ status: 'ok' });
});

// Payment webhook route (for future Stripe integration)
router.post('/payment', (req, res) => {
  console.log('Payment webhook received:', req.body);
  res.status(200).json({ status: 'ok' });
});

module.exports = router;
