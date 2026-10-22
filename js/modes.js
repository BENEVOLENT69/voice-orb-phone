// Output modes. Each mode is a built-in instruction plus one short example, so the cheap model
// follows the format without any training. Add a mode by adding an entry here.
const SUMMARY_INSTRUCTION = [
  'Clean up the transcript (drop filler words and repeats) and work out what the speaker is trying to achieve.',
  'Reply in plain text, no Markdown symbols other than "-" bullets, using exactly these sections:',
  'GOAL: one sentence.',
  'CONTEXT: what the speaker is working on or in.',
  'KEY POINTS: short bullets.',
  'NEXT STEPS: short bullets, or "None stated".',
].join('\n');

const MODES = [
  {
    id: 'prompt',
    label: 'Expert prompt',
    hint: 'Write it as a prompt like an expert',
    keywords: /\b(1|one|prompt|expert)\b/i,
    instruction: [
      'Rewrite the speaker\'s idea as a clear, expert-level prompt for an AI assistant.',
      'Plain text only. Use these labelled lines: ROLE, TASK, CONTEXT, REQUIREMENTS (bullets), OUTPUT FORMAT.',
      'Keep every fact and constraint the speaker gave. Do not invent requirements. If something important is missing, add a final line "QUESTIONS TO CLARIFY:" with up to 3 short questions.',
      'Example output:',
      'ROLE: You are a senior data analyst.',
      'TASK: Compare Q1 and Q2 sales and explain the biggest change.',
      'CONTEXT: Weekly report for a retail team.',
      'REQUIREMENTS:',
      '- Under 200 words',
      'OUTPUT FORMAT: Short paragraph then 3 bullets.',
    ].join('\n'),
  },
  {
    id: 'feedback',
    label: 'Chat feedback',
    hint: 'Restructure feedback for a chat with a model',
    keywords: /\b(2|two|feedback|restructure|chat)\b/i,
    instruction: [
      'The speaker is giving feedback or corrections to an AI model in a chat. Restructure it so the model can act on it.',
      'Plain text only. Use these labelled lines: WHAT WAS GOOD (bullets, only if mentioned), WHAT TO CHANGE (numbered, most important first), WHAT TO KEEP THE SAME (bullets, only if mentioned), NEXT REQUEST (one sentence).',
      'Be direct and specific. Keep the speaker\'s meaning and tone; do not add new opinions.',
    ].join('\n'),
  },
  {
    id: 'summary',
    label: 'Summary',
    hint: 'Summarise at a high level',
    keywords: /\b(3|three|summar\w*|high.?level)\b/i,
    instruction: SUMMARY_INSTRUCTION,
  },
  {
    id: 'condense',
    label: 'Condense intent',
    hint: 'Shortest version that keeps my meaning',
    keywords: /\b(4|four|condense|shorten|intent|short)\b/i,
    instruction: [
      'Condense what the speaker said into the shortest version that keeps exactly the same meaning and intent.',
      'Plain text, one to three sentences, first person if the speaker used it. No headings, no bullets, nothing added.',
    ].join('\n'),
  },
];

// Returns the first mode whose keywords match a spoken phrase, or null.
function matchSpokenMode(text) {
  return MODES.find((m) => m.keywords.test(text)) || null;
}

// Unique name: renderer scripts share one global scope, so a plain `api` would clash.
const voiceModesApi = { MODES, SUMMARY_INSTRUCTION, matchSpokenMode };
if (typeof module !== 'undefined' && module.exports) module.exports = voiceModesApi;
if (typeof window !== 'undefined') window.VoiceModes = voiceModesApi;
