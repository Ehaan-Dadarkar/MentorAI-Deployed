const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const User = require('../models/User');

const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@mentorai.app';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@1234';

const createDemoAccount = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const existingDemo = await User.findOne({ email: DEMO_EMAIL });

    if (existingDemo) {
      console.log('Demo account already exists. Updating demo flags and password...');
      const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
      await User.updateOne({ _id: existingDemo._id }, { isDemo: true, passwordHash });
      console.log('✅ Demo account updated');
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const demoUser = await User.create({
      name: 'Test User',
      email: DEMO_EMAIL,
      passwordHash,
      subjects: ['Mathematics', 'Physics', 'Computer Science'],
      studyGoalMinutes: 45,
      streak: 0,
      weakTopics: [],
      openrouterApiKey: null,
      isDemo: true,
    });

    console.log('✅ Demo account created successfully!');
    console.log('Email:', DEMO_EMAIL);
    console.log('Password:', DEMO_PASSWORD);
    console.log('User ID:', demoUser._id.toString());

    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating demo account:', err);
    process.exit(1);
  }
};

createDemoAccount();
