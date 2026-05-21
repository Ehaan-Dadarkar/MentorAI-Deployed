const Note = require("../models/Note");
const User = require("../models/User");

const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@mentorai.app";

const demoNotes = [
  {
    title: "Software Testing",
    subject: "Computer Science",
    content:
      "<h1>Software Testing</h1><p>Testing strategies, unit tests, integration tests, and regression testing for reliable systems.</p>",
    summary:
      "Core testing approaches for building reliable software systems.",
    tags: ["testing", "qa", "software-engineering"],
  },
  {
    title: "Machine Learning",
    subject: "Computer Science",
    content:
      "<h1>Machine Learning</h1><p>Supervised learning, unsupervised learning, model evaluation, and common algorithm families.</p>",
    summary:
      "Foundational machine learning concepts, workflows, and evaluation techniques.",
    tags: ["ml", "ai", "algorithms"],
  },
];

async function seedDemoNotes(demoUser) {
  const resolvedDemoUser =
    demoUser || (await User.findOne({ email: DEMO_EMAIL }).select("_id isDemo"));

  if (!resolvedDemoUser) {
    throw new Error("Demo user not found when seeding demo notes");
  }

  await Note.deleteMany({ userId: resolvedDemoUser._id, isDemoNote: true });

  const created = await Note.insertMany(
    demoNotes.map((note) => ({
      ...note,
      userId: resolvedDemoUser._id,
      isDeleted: false,
      deleted: false,
      isDemoNote: true,
      sourceType: "manual",
    })),
  );

  return created;
}

module.exports = { seedDemoNotes, demoNotes };
