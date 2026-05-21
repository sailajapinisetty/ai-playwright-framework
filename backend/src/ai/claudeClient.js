import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export async function askClaude({ system, user, maxTokens = 1200 }) {
  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }]
  });

  const textBlocks = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text);

  return textBlocks.join('\n').trim();
}

export async function askClaudeWithImage({ system, user, screenshotBase64, maxTokens = 1200 }) {
  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: user
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshotBase64
            }
          }
        ]
      }
    ]
  });

  const textBlocks = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text);

  return textBlocks.join('\n').trim();
}
