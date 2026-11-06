/**
 * Vercel function: every request is rewritten here (vercel.json) and handled by
 * the compiled Nest app in dist/ (built by `nest build`, which keeps the
 * decorator metadata Nest's dependency injection needs).
 */
module.exports = require('../dist/serverless').default;
