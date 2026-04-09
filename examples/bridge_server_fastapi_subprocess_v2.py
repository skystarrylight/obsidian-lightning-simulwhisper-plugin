from pathlib import Path
import json
import os
import re
import shlex
import subprocess
import tempfile
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title='Lightning SimulWhisper Bridge V2', version='0.3.0')


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'engine_root_configured': bool(os.environ.get('LIGHTNING_SIMULWHISPER_DIR', '').strip()),
        'entrypoint': os.environ.get('LIGHTNING_ENTRYPOINT', 'simulstreaming_whisper.py'),
    }


@app.post('/v1/transcriptions')
async def transcriptions(
    file: UploadFile = File(...),
    language: str = Form('ko'),
    model: str = Form('medium'),
    prompt: str = Form(''),
):
    suffix = Path(file.filename or 'audio.bin').suffix or '.bin'
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        temp_path = Path(tmp.name)

    try:
        result = run_engine(temp_path, language=language, model=model, prompt=prompt)
        return JSONResponse(result)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


def run_engine(audio_path: Path, language: str, model: str, prompt: str) -> dict[str, Any]:
    engine_root = Path(os.environ.get('LIGHTNING_SIMULWHISPER_DIR', '').strip())
    if not str(engine_root):
        raise HTTPException(status_code=500, detail='LIGHTNING_SIMULWHISPER_DIR is not set')

    entrypoint = engine_root / os.environ.get('LIGHTNING_ENTRYPOINT', 'simulstreaming_whisper.py')
    if not entrypoint.exists():
        raise HTTPException(status_code=500, detail=f'Entrypoint not found: {entrypoint}')

    cmd = build_command(entrypoint, audio_path, language=language, model=model, prompt=prompt)

    try:
        completed = subprocess.run(
            cmd,
            cwd=str(engine_root),
            capture_output=True,
            text=True,
            check=True,
            timeout=int(os.environ.get('LIGHTNING_SUBPROCESS_TIMEOUT_SEC', '1800')),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=500, detail={
            'message': 'Lightning-SimulWhisper timed out',
            'timeout_sec': os.environ.get('LIGHTNING_SUBPROCESS_TIMEOUT_SEC', '1800'),
            'stdout': exc.stdout,
            'stderr': exc.stderr,
        })
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail={
            'message': 'Lightning-SimulWhisper execution failed',
            'returncode': exc.returncode,
            'stdout': exc.stdout,
            'stderr': exc.stderr,
            'cmd': cmd,
        })

    text, segments = parse_output(completed.stdout)
    return {
        'text': text,
        'language': language,
        'segments': segments,
        'metadata': {
            'engine': 'lightning-simulwhisper',
            'model': model,
            'model_path': resolve_model_path(model),
            'prompt_passed': bool(prompt),
            'raw_stdout_lines': len((completed.stdout or '').splitlines()),
            'raw_stderr_lines': len((completed.stderr or '').splitlines()),
            'command': cmd,
        },
    }


def build_command(entrypoint: Path, audio_path: Path, language: str, model: str, prompt: str) -> list[str]:
    cmd = [
        os.environ.get('LIGHTNING_PYTHON_BIN', 'python'),
        str(entrypoint),
        str(audio_path),
        '--language', language or 'ko',
        '--model_name', model or 'medium',
        '--model_path', resolve_model_path(model),
        '-l', os.environ.get('LIGHTNING_LOG_LEVEL', 'CRITICAL'),
    ]

    if os.environ.get('LIGHTNING_USE_COREML', 'true').lower() in {'1', 'true', 'yes', 'on'}:
        cmd.append('--use_coreml')

    if prompt and os.environ.get('LIGHTNING_PROMPT_MODE', 'ignore') == 'arg':
        cmd.extend(['--prompt', prompt])

    extra_args = os.environ.get('LIGHTNING_EXTRA_ARGS', '').strip()
    if extra_args:
        cmd.extend(shlex.split(extra_args))

    return cmd


def resolve_model_path(model: str) -> str:
    if model == 'base':
        return os.environ.get('LIGHTNING_MODEL_PATH_BASE', 'mlx_base')
    if model == 'small':
        return os.environ.get('LIGHTNING_MODEL_PATH_SMALL', 'mlx_small')
    if model in {'large-v3', 'large-v3-turbo'}:
        return os.environ.get('LIGHTNING_MODEL_PATH_LARGE', 'mlx_large')
    return os.environ.get('LIGHTNING_MODEL_PATH_MEDIUM', 'mlx_medium')


def parse_output(stdout: str) -> tuple[str, list[dict[str, Any]]]:
    if not stdout.strip():
        return '', []

    json_candidate = try_parse_json(stdout)
    if json_candidate:
        text = str(json_candidate.get('text', '')).strip()
        segments = json_candidate.get('segments', [])
        return text, segments if isinstance(segments, list) else []

    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    cleaned_lines: list[str] = []
    segments: list[dict[str, Any]] = []

    bracket_ts = re.compile(r'^\[(\d+(?:\.\d+)?)\s*[-,:>]\s*(\d+(?:\.\d+)?)\]\s*(.*)$')
    arrow_ts = re.compile(r'^(\d+(?:\.\d+)?)\s*[-,:>]\s*(\d+(?:\.\d+)?)\s+(.*)$')

    for line in lines:
        if line.startswith('INFO') or line.startswith('DEBUG') or line.startswith('WARNING'):
            continue

        matched = bracket_ts.match(line) or arrow_ts.match(line)
        if matched:
            start, end, text = matched.groups()
            text = text.strip()
            if text:
                segments.append({'start': float(start), 'end': float(end), 'text': text})
                cleaned_lines.append(text)
            continue

        cleaned = re.sub(r'^\[?\d+(?:\.\d+)?\s*[-,:>]\s*\d+(?:\.\d+)?\]?\s*', '', line).strip()
        if cleaned:
            cleaned_lines.append(cleaned)

    deduped = dedupe_preserve_order(cleaned_lines)
    return '\n'.join(deduped).strip(), segments


def try_parse_json(stdout: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(stdout)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def dedupe_preserve_order(lines: list[str]) -> list[str]:
    seen = set()
    output = []
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        output.append(line)
    return output


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8765)
