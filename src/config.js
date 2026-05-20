import dotenv from 'dotenv';

dotenv.config();

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  claudeModel: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest'
};

if (!config.anthropicApiKey) {
  throw new Error('ANTHROPIC_API_KEY is missing. Add it to your .env file.');
}
