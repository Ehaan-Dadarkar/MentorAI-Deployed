const Note = require("../models/Note");
const User = require("../models/User");

const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@mentorai.app";

const demoNotes = [
  {
    title: "Software Testing",
    subject: "Computer Science",
    content: `
<h2>Software Testing</h2>
<p>Software testing is the process of evaluating a system to find defects, verify requirements, and improve confidence that the product behaves correctly in real use. It matters because good testing reduces risk, protects user trust, and helps teams ship reliable software faster.</p>
<h3>Types of Testing</h3>
<ul>
  <li><strong>Unit Testing:</strong> Tests small pieces of code in isolation.</li>
  <li><strong>Integration Testing:</strong> Checks that modules work together correctly.</li>
  <li><strong>System Testing:</strong> Verifies the complete application as a whole.</li>
  <li><strong>Acceptance Testing:</strong> Confirms the product meets user and business requirements.</li>
  <li><strong>Regression Testing:</strong> Ensures old functionality still works after changes.</li>
  <li><strong>Performance Testing:</strong> Measures speed, stability, and scalability under load.</li>
  <li><strong>Smoke Testing:</strong> Runs a quick check to see if the build is usable.</li>
  <li><strong>End-to-End Testing:</strong> Exercises full user workflows from start to finish.</li>
</ul>
<h3>Testing Approaches</h3>
<ul>
  <li><strong>Black Box Testing:</strong> Focuses on inputs and outputs without looking at implementation details.</li>
  <li><strong>White Box Testing:</strong> Uses knowledge of internal code structure to design tests.</li>
  <li><strong>Grey Box Testing:</strong> Combines both approaches with partial knowledge of the system.</li>
</ul>
<h3>Key Concepts</h3>
<ul>
  <li><strong>Test Case:</strong> A specific scenario with expected inputs and outcomes.</li>
  <li><strong>Test Suite:</strong> A collection of related test cases.</li>
  <li><strong>Bug / Defect:</strong> A flaw that causes the software to behave incorrectly.</li>
  <li><strong>Test Coverage:</strong> A measure of how much code or behavior is exercised by tests.</li>
  <li><strong>TDD (Test Driven Development):</strong> Write tests before writing the code they validate.</li>
  <li><strong>BDD (Behavior Driven Development):</strong> Describe behavior in a shared, user-focused language.</li>
  <li><strong>Mocking:</strong> Replacing dependencies with fake objects to isolate behavior.</li>
</ul>
<h3>The Testing Pyramid</h3>
<p>The testing pyramid recommends a large base of unit tests, a middle layer of integration tests, and a small top layer of end-to-end tests. This keeps tests fast, focused, and maintainable while still covering real workflows. When the pyramid is inverted, end-to-end tests become too numerous, slow, and fragile, which makes feedback loops painful and maintenance expensive.</p>
<h3>Common Testing Tools</h3>
<ul>
  <li><strong>Jest:</strong> A popular JavaScript testing framework.</li>
  <li><strong>Vitest:</strong> A fast modern test runner built for Vite projects.</li>
  <li><strong>Cypress:</strong> An end-to-end testing framework with strong browser tooling.</li>
  <li><strong>Playwright:</strong> A cross-browser automation and testing tool.</li>
  <li><strong>Selenium:</strong> A long-standing browser automation framework.</li>
  <li><strong>Postman:</strong> A tool for testing and validating APIs.</li>
  <li><strong>JUnit:</strong> A widely used Java testing framework.</li>
  <li><strong>PyTest:</strong> A flexible and expressive Python testing framework.</li>
</ul>
<h3>Best Practices</h3>
<ul>
  <li>Write tests early.</li>
  <li>Keep tests independent.</li>
  <li>Test edge cases.</li>
  <li>Automate where possible.</li>
  <li>Review test quality.</li>
</ul>
    `.trim(),
    summary:
      "A practical overview of testing types, strategies, tools, and best practices for building reliable software.",
    tags: ["testing", "qa", "software-engineering"],
  },
  {
    title: "Machine Learning",
    subject: "Computer Science",
    content: `
<h2>Machine Learning</h2>
<p>Machine learning is a field of artificial intelligence where systems learn patterns from data instead of being programmed with explicit rules. The core idea is to use examples to improve predictions, decisions, and automation over time.</p>
<h3>Types of Machine Learning</h3>
<ul>
  <li><strong>Supervised Learning:</strong> Learns from labeled examples.</li>
  <li><strong>Unsupervised Learning:</strong> Discovers structure in unlabeled data.</li>
  <li><strong>Semi-supervised Learning:</strong> Combines a small labeled set with a larger unlabeled set.</li>
  <li><strong>Reinforcement Learning:</strong> Learns by taking actions and receiving rewards.</li>
  <li><strong>Self-supervised Learning:</strong> Creates training signals from the data itself.</li>
</ul>
<h3>Core Algorithms</h3>
<ul>
  <li><strong>Linear Regression:</strong> Predicts continuous values with a linear relationship.</li>
  <li><strong>Logistic Regression:</strong> Predicts probabilities for classification tasks.</li>
  <li><strong>Decision Trees:</strong> Split data into branches based on feature rules.</li>
  <li><strong>Random Forest:</strong> Combines many decision trees for more stable predictions.</li>
  <li><strong>Gradient Boosting (XGBoost, LightGBM):</strong> Builds strong models from many weak learners.</li>
  <li><strong>Support Vector Machines (SVM):</strong> Finds a boundary that separates classes.</li>
  <li><strong>K-Nearest Neighbors (KNN):</strong> Predicts using nearby examples in feature space.</li>
  <li><strong>K-Means Clustering:</strong> Groups similar data points into clusters.</li>
  <li><strong>Neural Networks:</strong> Layered models that learn complex nonlinear patterns.</li>
</ul>
<h3>Key Concepts</h3>
<ul>
  <li><strong>Feature:</strong> An input variable used by the model.</li>
  <li><strong>Label:</strong> The target value the model tries to predict.</li>
  <li><strong>Training Set:</strong> Data used to fit the model.</li>
  <li><strong>Validation Set:</strong> Data used to tune model choices.</li>
  <li><strong>Test Set:</strong> Data used for final unbiased evaluation.</li>
  <li><strong>Overfitting:</strong> When a model learns noise instead of general patterns.</li>
  <li><strong>Underfitting:</strong> When a model is too simple to capture the signal.</li>
  <li><strong>Bias-Variance Tradeoff:</strong> The balance between simplicity and sensitivity to data.</li>
  <li><strong>Regularization:</strong> Techniques that reduce overfitting.</li>
  <li><strong>Cross-validation:</strong> Repeated evaluation across different data splits.</li>
  <li><strong>Hyperparameters:</strong> Settings chosen before training begins.</li>
</ul>
<h3>Model Evaluation Metrics</h3>
<ul>
  <li><strong>Accuracy:</strong> The share of correct predictions.</li>
  <li><strong>Precision:</strong> How many predicted positives are truly positive.</li>
  <li><strong>Recall (Sensitivity):</strong> How many actual positives are found.</li>
  <li><strong>F1 Score:</strong> A balance between precision and recall.</li>
  <li><strong>ROC-AUC:</strong> Measures how well a classifier separates classes.</li>
  <li><strong>Mean Squared Error (MSE):</strong> Average squared prediction error for regression.</li>
  <li><strong>R-squared:</strong> How much variance the model explains.</li>
</ul>
<h3>The ML Pipeline</h3>
<p>The ML pipeline usually follows a sequence of data collection, cleaning, feature engineering, model selection, training, evaluation, tuning, deployment, and monitoring. Each step matters because model quality depends on both the data and the process used to prepare and maintain it.</p>
<h3>Popular ML Libraries</h3>
<ul>
  <li><strong>Scikit-learn:</strong> A classic Python library for traditional ML workflows.</li>
  <li><strong>TensorFlow:</strong> A flexible framework for machine learning and deep learning.</li>
  <li><strong>PyTorch:</strong> A popular framework for research and production models.</li>
  <li><strong>XGBoost / LightGBM:</strong> High-performance gradient boosting libraries.</li>
  <li><strong>Pandas:</strong> A core data manipulation library.</li>
  <li><strong>NumPy:</strong> The foundation for numerical computing in Python.</li>
  <li><strong>Matplotlib / Seaborn:</strong> Visualization libraries for understanding data and results.</li>
</ul>
    `.trim(),
    summary:
      "A structured overview of machine learning concepts, algorithms, evaluation metrics, and the standard training pipeline.",
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
