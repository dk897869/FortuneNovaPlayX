const crypto = require('crypto');

/**
 * Generates a random 32-byte hex server seed.
 */
function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a seed using SHA-256.
 */
function hashSeed(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

/**
 * Generates a Dice game roll outcome.
 * @param {string} serverSeed - Plain server seed
 * @param {string} clientSeed - User seed
 * @param {number} nonce - In-game bet count
 * @returns {number} Roll between 0.00 and 99.99
 */
function getDiceRoll(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}-${nonce}`);
  const hash = hmac.digest('hex');
  
  // Take first 8 hex characters (4 bytes)
  const subHash = hash.substring(0, 8);
  const val = parseInt(subHash, 16);
  
  // Map to 0-9999, then divide by 100 to get 0.00 - 99.99
  return (val % 10000) / 100;
}

/**
 * Shuffles 0-24 grid indices using seeds + nonce to place mines.
 * @param {string} serverSeed - Plain server seed
 * @param {string} clientSeed - User seed
 * @param {number} nonce - In-game bet count
 * @param {number} mineCount - Total number of mines
 * @returns {number[]} Array of mine indices
 */
function getMinesPositions(serverSeed, clientSeed, nonce, mineCount) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}-${nonce}`);
  let hash = hmac.digest(); // Binary Buffer
  
  const indices = Array.from({ length: 25 }, (_, i) => i);
  let byteIndex = 0;
  
  function getNextByte() {
    if (byteIndex >= hash.length) {
      // Rehash to get another 32 bytes if we overrun
      hash = crypto.createHash('sha256').update(hash).digest();
      byteIndex = 0;
    }
    return hash[byteIndex++];
  }
  
  // Fisher-Yates Shuffle using hash bytes
  for (let i = 24; i > 0; i--) {
    const randomByte = getNextByte();
    const j = randomByte % (i + 1);
    
    // Swap
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
  }
  
  // Slice out the requested mine count
  return indices.slice(0, mineCount);
}

/**
 * Calculates a Subway Surfers crash point multiplier.
 * Uses Pareto distribution with a 3% house edge (instant crash at 1.00).
 */
function getCrashPoint(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}-${nonce}`);
  const hash = hmac.digest('hex');
  
  // Take first 8 hex characters (4 bytes)
  const subHash = hash.substring(0, 8);
  const val = parseInt(subHash, 16);
  const p = val / 4294967295; // 0.0 to 1.0
  
  // 3% instant crash chance
  if (val % 33 === 0) {
    return 1.00;
  }
  
  const crashPoint = Math.floor((100 * 0.97) / (1 - p)) / 100;
  return Math.max(1.01, crashPoint);
}

module.exports = {
  generateServerSeed,
  hashSeed,
  getDiceRoll,
  getMinesPositions,
  getCrashPoint
};
