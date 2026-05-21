const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/api-key', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+openrouterApiKey');
    const key = user?.openrouterApiKey;

    if (!key) {
      return res.json({ success: true, hasApiKey: false, maskedKey: null });
    }

    const masked = key.substring(0, 8) + '****...****' + key.slice(-4);
    return res.json({ success: true, hasApiKey: true, maskedKey: masked });
  } catch (err) {
    console.error('Error in /api/settings/api-key GET', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// SAVE / UPDATE API key
router.post('/api-key', auth, async (req, res) => {
  try {
    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        error: 'Demo account settings cannot be changed.',
      });
    }

    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid API key provided' });
    }

    if (!apiKey.startsWith('sk-or-')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid OpenRouter API key format. Key should start with sk-or-',
      });
    }

    // ✅ FIX: use req.user._id instead of req.user.id
    await User.findByIdAndUpdate(req.user._id, { openrouterApiKey: apiKey });

    res.json({ success: true, message: 'API key saved successfully. Rate limits removed!' });
  } catch (err) {
    console.error('Error in /api/settings/api-key POST', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE API key
router.delete('/api-key', auth, async (req, res) => {
  try {
    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        error: 'Demo account settings cannot be changed.',
      });
    }

    // ✅ FIX: use req.user._id instead of req.user.id
    await User.findByIdAndUpdate(req.user._id, { openrouterApiKey: null });

    res.json({ success: true, message: 'API key removed. Default rate limits now apply.' });
  } catch (err) {
    console.error('Error in /api/settings/api-key DELETE', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;