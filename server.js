
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

const PORT = process.env.PORT || 5000;
const DATABASE_NAME = 'CDA';

// =======================================
// EXPRESS CONFIGURATION
// =======================================

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// =======================================
// MONGODB SCHEMAS
// =======================================

const cardSchema = new mongoose.Schema(
  {},
  {
    strict: false
  }
);

const answerItemSchema = new mongoose.Schema(
  {
    questionId: {
      type: Number,
      required: true
    },
    answerId: {
      type: Number,
      required: true
    },
    correct: {
      type: Boolean,
      default: null
    }
  },
  {
    _id: false
  }
);

const submissionSchema = new mongoose.Schema({
  answers: {
    type: [answerItemSchema],
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});

// =======================================
// COLLECTION MODELS
// =======================================

// PROTECTION
const ProtectionCard = mongoose.model(
  'ProtectionCard',
  cardSchema,
  'protectioncards'
);

const ProtectionAnswer = mongoose.model(
  'ProtectionAnswer',
  submissionSchema,
  'protectionanswers'
);

// ADVOCACY
const AdvocacyCard = mongoose.model(
  'AdvocacyCard',
  cardSchema,
  'advocacycards'
);

const AdvocacyAnswer = mongoose.model(
  'AdvocacyAnswer',
  submissionSchema,
  'advocacyanswers'
);

// EMPOWERMENT
const EmpowermentCard = mongoose.model(
  'EmpowermentCard',
  cardSchema,
  'empowermentcards'
);

const EmpowermentAnswer = mongoose.model(
  'EmpowermentAnswer',
  submissionSchema,
  'empowermentanswers'
);

// =======================================
// FORMAT CARD DATA
// =======================================

function formatCard(card) {
  return {
    ...card,

    card_video_url_ar:
      card.card_video_url_ar || '',

    card_video_url_en:
      card.card_video_url_en || '',

    card_video_correct_answer_url_ar:
      card.card_video_correct_answer_url_ar || '',

    card_video_correct_answer_url_en:
      card.card_video_correct_answer_url_en || '',

    card_video_wrong_answer_url_ar:
      card.card_video_wrong_answer_url_ar || '',

    card_video_wrong_answer_url_en:
      card.card_video_wrong_answer_url_en || '',

    answers: Array.isArray(card.answers)
      ? card.answers.map(answer => ({
          ...answer,
          correct:
            typeof answer.correct === 'boolean'
              ? answer.correct
              : null
        }))
      : []
  };
}

// =======================================
// FETCH CARDS
// =======================================

// No section filter.
// Each model reads its own MongoDB collection.

async function fetchCards(Model) {
  const cards = await Model.find({})
    .select('-_id -__v')
    .sort({
      scenario_number: 1,
      id: 1
    })
    .lean();

  return cards.map(formatCard);
}

// =======================================
// VALIDATE AND SAVE ANSWERS
// =======================================

async function saveAnswers(
  answers,
  CardModel,
  AnswerModel
) {
  if (
    !Array.isArray(answers) ||
    answers.length === 0
  ) {
    const error = new Error(
      'Answers are required'
    );
    error.status = 400;
    throw error;
  }

  const cards = await fetchCards(CardModel);

  const cardMap = new Map(
    cards.map(card => [
      Number(card.id),
      card
    ])
  );

  const records = [];
  const seen = new Set();

  let gradedTotal = 0;
  let correctCount = 0;
  let wrongCount = 0;

  for (const item of answers) {
    const questionId = Number(
      item?.questionId ?? item?.cardId
    );

    const answerId = Number(
      item?.answerId
    );

    if (
      !Number.isInteger(questionId) ||
      !Number.isInteger(answerId)
    ) {
      const error = new Error(
        'Invalid question or answer ID'
      );
      error.status = 400;
      throw error;
    }

    if (seen.has(questionId)) {
      const error = new Error(
        'Duplicate question answers are not allowed'
      );
      error.status = 400;
      throw error;
    }

    seen.add(questionId);

    const card = cardMap.get(questionId);

    if (!card) {
      const error = new Error(
        `Question ${questionId} not found`
      );
      error.status = 400;
      throw error;
    }

    const selected = (
      card.answers || []
    ).find(
      answer =>
        Number(answer.id) === answerId
    );

    if (!selected) {
      const error = new Error(
        `Invalid answer for question ${questionId}`
      );
      error.status = 400;
      throw error;
    }

    const correct =
      typeof selected.correct === 'boolean'
        ? selected.correct
        : null;

    records.push({
      questionId,
      answerId,
      correct
    });

    // Only general questions are graded.
    // Role answers are stored but ungraded.

    if (
      card.category === 'general' &&
      correct !== null
    ) {
      gradedTotal++;

      if (correct) {
        correctCount++;
      } else {
        wrongCount++;
      }
    }
  }

  const submission = await AnswerModel.create({
    answers: records
  });

  return {
    success: true,
    message: 'Answers saved successfully',
    submissionId: submission._id,
    result: {
      total: gradedTotal,
      correct: correctCount,
      wrong: wrongCount,
      answers: records
    }
  };
}

// =======================================
// PROTECTION API
// =======================================

// GET /api/protection/cards

app.get('/api/protection/cards', async (req, res) => {
  try {
    const cards = await fetchCards(
      ProtectionCard
    );

    return res.status(200).json({
      success: true,
      total: cards.length,
      cards
    });
  } catch (error) {
    console.error(
      'Protection cards error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve protection cards'
    });
  }
});

// POST /api/protection/answers

app.post('/api/protection/answers', async (req, res) => {
  try {
    const result = await saveAnswers(
      req.body?.answers,
      ProtectionCard,
      ProtectionAnswer
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error(
      'Protection answers error:',
      error
    );

    return res.status(error.status || 500).json({
      success: false,
      message: error.message
    });
  }
});

// =======================================
// ADVOCACY API
// =======================================

// GET /api/advocacy/cards

app.get('/api/advocacy/cards', async (req, res) => {
  try {
    const cards = await fetchCards(
      AdvocacyCard
    );

    return res.status(200).json({
      success: true,
      total: cards.length,
      cards
    });
  } catch (error) {
    console.error(
      'Advocacy cards error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve advocacy cards'
    });
  }
});

// POST /api/advocacy/answers

app.post('/api/advocacy/answers', async (req, res) => {
  try {
    const result = await saveAnswers(
      req.body?.answers,
      AdvocacyCard,
      AdvocacyAnswer
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error(
      'Advocacy answers error:',
      error
    );

    return res.status(error.status || 500).json({
      success: false,
      message: error.message
    });
  }
});

// =======================================
// EMPOWERMENT API
// =======================================

// GET /api/empowerment/cards

app.get('/api/empowerment/cards', async (req, res) => {
  try {
    const cards = await fetchCards(
      EmpowermentCard
    );

    return res.status(200).json({
      success: true,
      total: cards.length,
      cards
    });
  } catch (error) {
    console.error(
      'Empowerment cards error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve empowerment cards'
    });
  }
});

// POST /api/empowerment/answers

app.post('/api/empowerment/answers', async (req, res) => {
  try {
    const result = await saveAnswers(
      req.body?.answers,
      EmpowermentCard,
      EmpowermentAnswer
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error(
      'Empowerment answers error:',
      error
    );

    return res.status(error.status || 500).json({
      success: false,
      message: error.message
    });
  }
});

// =======================================
// CATEGORY ENDPOINTS
// =======================================

app.get('/api/protection/categories', (req, res) => {
  return res.json({
    success: true,
    categories: [
      'general',
      'role',
      'parent_protection_role',
      'parent_protection_card'
    ]
  });
});

app.get('/api/advocacy/categories', (req, res) => {
  return res.json({
    success: true,
    categories: [
      'role',
      'general'
    ]
  });
});

app.get('/api/empowerment/categories', (req, res) => {
  return res.json({
    success: true,
    categories: [
      'role',
      'general'
    ]
  });
});

// =======================================
// HEALTH CHECK
// =======================================

app.get('/api/health', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'CDA API is running',
    database: mongoose.connection.name,
    databaseStatus:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected',
    collections: [
      'protectioncards',
      'protectionanswers',
      'advocacycards',
      'advocacyanswers',
      'empowermentcards',
      'empowermentanswers'
    ]
  });
});

// =======================================
// 404 HANDLER
// =======================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`
  });
});

// =======================================
// MONGODB CONNECTION
// =======================================

async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is missing in .env'
    );
  }

  await mongoose.connect(
    process.env.MONGODB_URI,
    {
      dbName: DATABASE_NAME,
      serverSelectionTimeoutMS: 30000
    }
  );

  console.log(
    `[MongoDB] Connected to ${mongoose.connection.name}`
  );

  app.listen(PORT, () => {
    console.log('=================================');
    console.log('HIMAYA BACKEND RUNNING');
    console.log(`Port: ${PORT}`);
    console.log(`Database: ${DATABASE_NAME}`);
    console.log('');
    console.log('PROTECTION API');
    console.log(
      `http://localhost:${PORT}/api/protection/cards`
    );
    console.log('');
    console.log('ADVOCACY API');
    console.log(
      `http://localhost:${PORT}/api/advocacy/cards`
    );
    console.log('');
    console.log('EMPOWERMENT API');
    console.log(
      `http://localhost:${PORT}/api/empowerment/cards`
    );
    console.log('=================================');
  });
}

startServer().catch(error => {
  console.error(
    'Server startup error:',
    error
  );

  process.exit(1);
});
