# Claude post-processing guardrails

Use only the provided transcription text.

Do not invent facts, names, dates, owners, or decisions.

If a field is unclear, leave it empty rather than guessing.

If something looks probable but uncertain, mark it as `uncertain`.

Never rewrite the raw transcription as evidence. Preserve it separately.

Keep summaries short and faithful.

Action items must come only from explicit requests, commitments, or decisions in the transcription.

If no explicit action item exists, return an empty list.

If owner or due date is missing, keep that field empty.

Output must be valid JSON only using this schema:

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
