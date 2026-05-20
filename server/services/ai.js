  const axios = require("axios");

  const OLLAMA_BASE_URL = (
    process.env.OLLAMA_URL || "http://localhost:11434"
  ).replace(/\/v1$/, "");
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3.5:2b";
  const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
  const OPENROUTER_MODEL =
    process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct";
  const USE_OPENROUTER_IN_PRODUCTION = process.env.NODE_ENV === "production";

  console.log(
    "AI Backend:",
    USE_OPENROUTER_IN_PRODUCTION ? "OpenRouter (production)" : `Ollama at ${OLLAMA_BASE_URL}`,
  );
  console.log("Ollama Model:", OLLAMA_MODEL);
  console.log("OpenRouter Model (JSON tasks):", OPENROUTER_MODEL);

  const callOpenRouter = async (messages, options = {}) => {
    const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;

    try {
      const response = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: options.model || OPENROUTER_MODEL,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173",
            "X-Title": "Mentorai Learning App",
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error(
        "OpenRouter API error FULL:",
        JSON.stringify(error.response?.data, null, 2),
      );
      console.error("Status:", error.response?.status);
      throw new Error("AI service temporarily unavailable");
    }
  };

  const callOllama = async (messages, options = {}) => {
    if (USE_OPENROUTER_IN_PRODUCTION) {
      return callOpenRouter(messages, {
        ...options,
        model: options.model || OPENROUTER_MODEL,
        apiKey: options.apiKey,
      });
    }

    try {
      const response = await axios.post(
        `${OLLAMA_BASE_URL}/api/chat`,
        {
          model: options.model || OLLAMA_MODEL,
          messages,
          think: false,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 2048,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      return response.data.message.content;
    } catch (error) {
      console.error(
        "Ollama API error FULL:",
        JSON.stringify(error.response?.data, null, 2),
      );
      console.error("Status:", error.response?.status);
      throw new Error("AI service temporarily unavailable");
    }
  };

  // ─── AI Tutor ───────────────────────────────────────────
  const tutorChat = async (messages, weakTopics = [], options = {}) => {
    const systemPrompt = {
      role: "system",
      content: `You are an expert tutor. Help university students deeply understand any concept they bring to you, across any subject or discipline.

  Teaching style:
    - Give clear, concise explanations with examples
    - Use analogies to simplify complex ideas
    - Ask follow-up questions to check understanding
    - If a student is struggling, break concepts into smaller parts
    - Reference and connect related concepts
  ${weakTopics.length > 0 ? `\nThe student has shown weakness in these topics: ${weakTopics.join(", ")}. Gently reinforce these when relevant.` : ""}

  Format responses with markdown. Use bullet points, headings, and code blocks where appropriate.`,
    };

    return callOllama([systemPrompt, ...messages], options);
  };

  // ─── Generate Flashcards ────────────────────────────────
  const generateFlashcards = async (content, subject, count = 10, options = {}) => {
    const messages = [
      {
        role: "system",
        content: `You are an expert flashcard creator. Generate exactly ${count} high-quality flashcards from the provided content.

    Rules:
    - Each question should test a single concept
    - Answers should be concise but complete
    - Mix difficulty levels: easy, medium, hard
    - Focus on key concepts, definitions, and relationships
    - Avoid trivial or overly broad questions

    Return ONLY valid JSON in this exact format:
    {
      "flashcards": [
        {
          "question": "What is...",
          "answer": "It is...",
          "difficulty": "easy|medium|hard"
        }
      ]
    }`,
      },
      {
        role: "user",
        content: `Subject: ${subject}\n\nContent:\n${content}`,
      },
    ];

    const response = await callOpenRouter(messages, {
      temperature: 0.5,
      apiKey: options.apiKey,
    });
    try {
      const parsed = JSON.parse(response);
      return parsed.flashcards;
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]).flashcards;
      }
      throw new Error("Failed to parse flashcard response");
    }
  };

  // ─── Generate Quiz ──────────────────────────────────────
  const generateQuiz = async (content, subject, count = 10, options = {}) => {
    const messages = [
      {
        role: "system",
        content: `You are an expert quiz creator for university students. Generate exactly ${count} multiple-choice questions.

    Rules:
    - Each question has exactly 4 options (A, B, C, D)
    - Only one correct answer per question
    - Include a brief explanation for the correct answer
    - Tag each question with its specific topic
    - Mix difficulty levels
    - Make distractors plausible but clearly wrong

    Return ONLY valid JSON in this exact format:
    {
      "questions": [
        {
          "question": "What is...",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": 0,
          "explanation": "The correct answer is A because...",
          "topic": "Topic Name"
        }
      ]
    }`,
      },
      {
        role: "user",
        content: `Subject: ${subject}\n\nContent:\n${content}`,
      },
    ];

    const response = await callOpenRouter(messages, {
      temperature: 0.5,
      apiKey: options.apiKey,
    });
    try {
      const parsed = JSON.parse(response);
      return parsed.questions;
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]).questions;
      }
      throw new Error("Failed to parse quiz response");
    }
  };

  // ─── Voice Recall Questions ─────────────────────────────
  const generateVoiceQuestions = async (content, subject, count = 5, options = {}) => {
    const messages = [
      {
        role: "system",
        content: `Generate exactly ${count} open-ended recall questions for a voice-based study session.

    Rules:
    - Questions should require the student to explain concepts in their own words
    - Include the key concepts/keywords expected in a good answer
    - Order from easier to harder
    - Focus on understanding, not memorization

    Return ONLY valid JSON:
    {
      "questions": [
        {
          "question": "Explain...",
          "expectedConcepts": ["concept1", "concept2", "concept3"]
        }
      ]
    }`,
      },
      {
        role: "user",
        content: `Subject: ${subject}\n\nContent:\n${content}`,
      },
    ];

    const response = await callOpenRouter(messages, {
      temperature: 0.5,
      apiKey: options.apiKey,
    });
    try {
      const parsed = JSON.parse(response);
      return parsed.questions;
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]).questions;
      }
      throw new Error("Failed to parse voice questions response");
    }
  };

  // ─── Generate Voice Recall Questions (NEW SPEC) ──────────
  const generateVoiceRecallQuestions = async (
    noteTitle,
    noteContent,
    count = 5,
    model = "mistralai/mistral-7b-instruct",
    options = {},
  ) => {
    const messages = [
      {
        role: "system",
        content: `You are a study assistant. Generate exactly ${count} questions.
    CRITICAL: Use ONLY the following content. Do not use any outside knowledge whatsoever.

    Title: ${noteTitle}

    Content:
    ${noteContent}

    Return ONLY a valid JSON array, no extra text, no markdown:
    [{ "question": "string", "keyPoints": ["string"], "difficulty": "easy|medium|hard" }]`,
      },
      {
        role: "user",
        content: `Generate exactly ${count} questions strictly from the content above. Do not reference anything outside of it.`,
      },
    ];

    const response = await callOpenRouter(messages, {
      temperature: 0.3,
      model,
      apiKey: options.apiKey,
    });
    try {
      console.log("AI raw response:", response.substring(0, 500));
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return parsed.questions || parsed;
    } catch {
      // Try to extract JSON array from response
      try {
        // Remove markdown code blocks if present
        const cleaned = response
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        // Find JSON array
        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]");

        if (start !== -1 && end !== -1) {
          const jsonStr = cleaned.substring(start, end + 1);
          return JSON.parse(jsonStr);
        }
      } catch (e) {
        console.error("JSON extraction failed:", e.message);
        console.error("Raw response was:", response);
      }

      throw new Error("Failed to parse voice recall questions response");
    }
  };

  // ─── Evaluate Voice Response ────────────────────────────
  const evaluateVoiceResponse = async (
    question,
    expectedConcepts,
    userResponse,
  ) => {
    const messages = [
      {
        role: "system",
        content: `You are evaluating a student's verbal response to a study question.

    Score the response 0-100 based on:
    - Accuracy of concepts mentioned (40%)
    - Completeness of explanation (30%)
    - Clarity and coherence (30%)

    Return ONLY valid JSON:
    {
      "score": 75,
      "feedback": "Good explanation of X, but you missed Y. Consider..."
    }`,
      },
      {
        role: "user",
        content: `Question: ${question}\nExpected concepts: ${expectedConcepts.join(", ")}\nStudent's response: "${userResponse}"`,
      },
    ];

    const response = await callOllama(messages, { temperature: 0.3 });
    try {
      return JSON.parse(response);
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { score: 0, feedback: "Could not evaluate response" };
    }
  };

  // ─── Evaluate Voice Answer (NEW SPEC) ────────────────────
  const evaluateVoiceAnswer = async (
    question,
    correctKeyPoints,
    spokenAnswer,
    confidence,
  ) => {
    const messages = [
      {
        role: "system",
        content: `A student was asked: '${question}'
    Key points that should be in the answer: ${correctKeyPoints.join(", ")}
    The student answered via voice recognition: '${spokenAnswer}'
    Their confidence before answering: ${confidence}/5

    IMPORTANT CONTEXT:
    - This answer was captured by voice recognition (Web Speech API)
    - Voice recognition makes phonetic substitution errors
    - Common errors: "effect"→"defect", "their"→"there", "you"→"your", "a"→"the", etc.
    - Evaluate the INTENDED meaning, not the literal transcription
    - Give full credit for phonetically similar substitutions when the intended woard fits the context
    - Only flag as wrong if the concept itself is missing, not if a word sounds similar to the correct word

    SPEECH CORRECTION DETECTION:
    - Identify any words in the student's answer that appear to be speech recognition errors for important technical or subject-specific terms
    - Only flag corrections for KEY CONCEPT words, not common words like "the", "a", "is", "their", "there", "your", "you", "ok", "and", "or", "but"
    - A correction is only valid if the substituted word makes no sense in context but a phonetically similar word does

    Evaluate and return ONLY valid JSON:
    {
      "score": number (0-100),
      "verdict": "excellent"|"good"|"partial"|"incorrect",
      "whatWasCorrect": "string describing correct concepts",
      "whatWasMissed": ["specific concept gap 1"],
      "improvement": "one specific concept to add next time",
      "encouragement": "one short encouraging sentence",
      "speechCorrections": [
        {
          "heard": "effect",
          "intended": "defect",
          "context": "you probably meant 'defect' when you said 'effect'"
        }
      ]
    }

    speechCorrections should be an empty array [] if no corrections detected. Never add corrections for common/filler words. Only add when a technical or subject-specific word was clearly misheared.`,
      },
      {
        role: "user",
        content: `Question: ${question}
    Key points expected: ${correctKeyPoints.join(", ")}
    Student's spoken answer: "${spokenAnswer}"
    Confidence before answering: ${confidence}/5`,
      },
    ];

    const response = await callOllama(messages, { temperature: 0.4 });
    try {
      const parsed = JSON.parse(response);
      return parsed;
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {
        score: 0,
        verdict: "incorrect",
        whatWasCorrect: "",
        whatWasMissed: correctKeyPoints,
        improvement: "Please try again",
        encouragement: "You can do better!",
      };
    }
  };

  // ─── Summarize Notes ────────────────────────────────────
  const summarizeContent = async (content, style = "concise", options = {}) => {
    const messages = [
      {
        role: "system",
        content: `Summarize the following content in a ${style} style. Use markdown formatting with clear headings, bullet points, and key takeaways. Highlight important terms in bold.`,
      },
      {
        role: "user",
        content,
      },
    ];

    return callOllama(messages, options);
  };

  // ─── Extract Weak Topics ────────────────────────────────
  const extractWeakTopics = async (sessionData) => {
    const messages = [
      {
        role: "system",
        content: `Analyze this study session data and identify the student's weak topics.

    Return ONLY valid JSON:
    {
      "weakTopics": ["topic1", "topic2"],
      "recommendations": "Brief study recommendations..."
    }`,
      },
      {
        role: "user",
        content: JSON.stringify(sessionData),
      },
    ];

    const response = await callOllama(messages, { temperature: 0.3 });
    try {
      return JSON.parse(response);
    } catch {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { weakTopics: [], recommendations: "" };
    }
  };

  module.exports = {
    callOllama,
    callOpenRouter,
    tutorChat,
    generateFlashcards,
    generateQuiz,
    generateVoiceQuestions,
    generateVoiceRecallQuestions,
    evaluateVoiceResponse,
    evaluateVoiceAnswer,
    summarizeContent,
    extractWeakTopics,
  };
