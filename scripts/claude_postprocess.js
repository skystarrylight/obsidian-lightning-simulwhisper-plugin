#!/usr/bin/env node
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const guardrailPath = process.argv[4] || 'docs/claude-postprocess-guardrails.md';
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/claude_postprocess.js <input_transcript.txt> <output_json> [guardrails.md]');
    process.exit(1);
  }
  const transcript = fs.readFileSync(inputPath, 'utf8');
  const systemPrompt = fs.readFileSync(guardrailPath, 'utf8');
  const userPrompt = [
    'Return valid JSON only.',
    'Use this schema:',
    '{"summary":"","key_points":[],"decisions":[],"action_items":[{"owner":"","task":"","due_date":"","uncertain":false}],"open_questions":[]}',
    'Transcription:',
    transcript,
  ].join('\n\n');

  const claudeBin = process.env.CLAUDE_BIN || 'claude';
  const timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS || '120000');

  const { stdout } = await execFileAsync(claudeBin, ['-p', userPrompt, '--append-system-prompt', systemPrompt, '--output-format', 'json'], {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });

  const wrapped = JSON.parse(stdout);
  const resultText = typeof wrapped.result === 'string' ? wrapped.result : '{}';
  const parsed = JSON.parse(resultText);
  fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
  process.stdout.write(JSON.stringify(parsed, null, 2));
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
