const express = require('express');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET current API key status (masked)
router.get('/api-key', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+openrouterApiKey');

    if (!user || !user.openrouterApiKey) {
      return res.json({ success: true, hasApiKey: false, maskedKey: null });
    }

    const key = user.openrouterApiKey;
    const masked = key.substring(0, 8) + '****...****' + key.slice(-4);

    return res.json({ success: true, hasApiKey: true, maskedKey: masked });
  } catch (err) {
    console.error('Error in /api/settings/api-key GET', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// SAVE / UPDATE API key
router.post('/api-key', authenticate, async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid API key provided' });
    }

    if (!apiKey.startsWith('sk-or-')) {
      return res.status(400).json({ success: false, error: 'Invalid OpenRouter API key format. Key should start with sk-or-' });
    }

    if (req.user && req.user.email === 'demo@mentorai.app') {
      return res.status(403).json({ success: false, error: 'Demo account cannot save API keys. Please register a free account.' });
    }

    await User.findByIdAndUpdate(req.user.id, { openrouterApiKey: apiKey });

    res.json({ success: true, message: 'API key saved successfully. Rate limits removed!' });
  } catch (err) {
    console.error('Error in /api/settings/api-key POST', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE API key
router.delete('/api-key', authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { openrouterApiKey: null });

    res.json({ success: true, message: 'API key removed. Default rate limits now apply.' });
  } catch (err) {
    console.error('Error in /api/settings/api-key DELETE', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
