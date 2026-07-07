require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const apiRouter = require('./routes/api');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());

// Mount API Router
app.use('/api', apiRouter);

// Root path diagnostic
app.get('/', (req, res) => {
  res.json({ message: 'FortunePlayX API is active.' });
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Server error occurred.' });
});

// Only bind HTTP port if not running Jest integration tests
if (process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`[SERVER] Listening on port ${PORT}`);
    });
  });
}

module.exports = app;
