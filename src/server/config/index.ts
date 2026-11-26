// ──────────────────────────────────────────────────────────────
// SDG Nexus — Environment Configuration
// Enterprise-grade config with validation
// ──────────────────────────────────────────────────────────────

const config = {
    // ─── Server ──────────────────────────────────────────────
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV !== 'production',

    // ─── Database ────────────────────────────────────────────
    databaseUrl: process.env.DATABASE_URL || '',

    // ─── JWT ─────────────────────────────────────────────────
    // JWT secret and expiry live in src/server/middleware/auth.ts (fails closed in production).

    // ─── Bcrypt ──────────────────────────────────────────────
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),

    // ─── Rate Limiting ───────────────────────────────────────
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15min
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    rateLimitSensitiveMax: parseInt(process.env.RATE_LIMIT_SENSITIVE_MAX || '10', 10),

    // ─── Scoring ─────────────────────────────────────────────
    scoringVersion: process.env.SCORING_VERSION || '2.0',
    maxImpactScore: 1000,
    scoreRecalcBatchSize: parseInt(process.env.SCORE_RECALC_BATCH_SIZE || '50', 10),

    // ─── Background Jobs ─────────────────────────────────────
    riskScanIntervalMs: parseInt(process.env.RISK_SCAN_INTERVAL_MS || '86400000', 10), // 24h
    fundingGapRecalcIntervalMs: parseInt(process.env.FUNDING_GAP_RECALC_INTERVAL_MS || '86400000', 10),

    // ─── Pagination ──────────────────────────────────────────
    defaultPageSize: 20,
    maxPageSize: 100,

    // ─── OpenAI (optional) ───────────────────────────────────
    openaiApiKey: process.env.OPENAI_API_KEY || '',
} as const;

export default config;
export type AppConfig = typeof config;
