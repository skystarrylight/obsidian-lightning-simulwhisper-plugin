# Claude headless post-processing

## Purpose

Use Lightning-SimulWhisper only for transcription and use Claude headless only for structuring the transcription into summary fields.

## Why this split

- STT and summarization are different responsibilities.
- Raw transcription should always remain available as evidence.
- Claude output should be treated as a structured summary layer, not as the source of truth.

## Guardrails

The script reads `docs/claude-postprocess-guardrails.md` by default.

These rules are intended to reduce hallucinations by forcing:

- source-only summarization
- no invented names or owners
- empty fields when unclear
- explicit `uncertain` markers
- JSON-only output

## Run

```bash
make claude-postprocess TRANSCRIPT=/absolute/path/to/transcript.txt
```

Optional outputs:

```bash
make claude-postprocess \
  TRANSCRIPT=/absolute/path/to/transcript.txt \
  CLAUDE_JSON_OUT=/absolute/path/to/claude_postprocess.json \
  GUARDRAILS=docs/claude-postprocess-guardrails.md
```

## Output schema

```json
{
  "summary": "",
  "key_points": [],
  "decisions": [],
  "action_items": [
    {
      "owner": "",
      "task": "",
      "due_date": "",
      "uncertain": false
    }
  ],
  "open_questions": []
}
```

## Recommended use

1. Save raw transcription first.
2. Run Claude post-processing second.
3. Fill template placeholders from the structured JSON.
4. If Claude fails, keep the raw transcription note and skip structured output.
