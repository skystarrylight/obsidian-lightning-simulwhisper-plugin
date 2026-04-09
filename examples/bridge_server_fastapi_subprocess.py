from pathlib import Path
import os
import re
import subprocess
import tempfile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title='Lightning SimulWhisper Bridge', version='0.2.0')


@app.get('/health')
def health():
    return {'status': 'ok'}


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


def run_engine(audio_path: Path, language: str, model: str, prompt: str):
    engine_root = Path(os.environ.get('LIGHTNING_SIMULWHISPER_DIR', '').strip())
    if not str(engine_root):
        raise HTTPException(status_code=500, detail='LIGHTNING_SIMULWHISPER_DIR is not set')

    entrypoint = engine_root / os.environ.get('LIGHTNING_ENTRYPOINT', 'simulstreaming_whisper.py')
    if not entrypoint.exists():
        raise HTTPException(status_code=500, detail=f'Entrypoint not found: {entrypoint}')

    model_path = resolve_model_path(model)
    cmd = [
        'python',
        str(entrypoint),
        str(audio_path),
        '--language', language or 'ko',
        '--model_name', model or 'medium',
        '--model_path', model_path,
        '-l', 'CRITICAL',
    ]

    if os.environ.get('LIGHTNING_USE_COREML', 'true').lower() in {'1', 'true', 'yes', 'on'}:
        cmd.append('--use_coreml')

    extra_args = os.environ.get('LIGHTNING_EXTRA_ARGS', '').strip()
    if extra_args:
        cmd.extend(extra_args.split())

    try:
        completed = subprocess.run(
            cmd,
            cwd=str(engine_root),
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise HTTPException(
            status_code=500,
            detail={
                'message': 'Lightning-SimulWhisper execution failed',
                'returncode': exc.returncode,
                'stdout': exc.stdout,
                'stderr': exc.stderr,
            },
        )

    text = extract_text(completed.stdout)
    return {
        'text': text,
        'language': language,
        'segments': [],
        'metadata': {
            'engine': 'lightning-simulwhisper',
            'model': model,
            'model_path': model_path,
            'prompt_passed': bool(prompt),
        },
    }


def resolve_model_path(model: str) -> str:
    if model == 'base':
        return os.environ.get('LIGHTNING_MODEL_PATH_BASE', 'mlx_base')
    if model == 'small':
        return os.environ.get('LIGHTNING_MODEL_PATH_SMALL', 'mlx_small')
    if model in {'large-v3', 'large-v3-turbo'}:
        return os.environ.get('LIGHTNING_MODEL_PATH_LARGE', 'mlx_large')
    return os.environ.get('LIGHTNING_MODEL_PATH_MEDIUM', 'mlx_medium')


def extract_text(stdout: str) -> str:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    if not lines:
        return ''

    cleaned = []
    timestamp_pattern = re.compile(r'^\[?\d+(?:\.\d+)?\s*[-,:>]\s*\d+(?:\.\d+)?\]?\s*')
    for line in lines:
        line = timestamp_pattern.sub('', line)
        if line.startswith('INFO') or line.startswith('DEBUG'):
            continue
        cleaned.append(line)
    return '\n'.join(cleaned).strip()


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8765)
