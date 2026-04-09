from pathlib import Path
import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI(title='Local Transcription Bridge', version='0.1.0')


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
        temp_path = tmp.name

    try:
        text = run_engine_stub(temp_path, language=language, model=model, prompt=prompt)
        return JSONResponse({
            'text': text,
            'language': language,
            'segments': [],
            'metadata': {
                'engine': 'lightning-simulwhisper-adapter',
                'model': model,
            },
        })
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def run_engine_stub(audio_path: str, language: str, model: str, prompt: str) -> str:
    engine_root = os.environ.get('LIGHTNING_SIMULWHISPER_DIR', '').strip()
    if not engine_root:
        raise HTTPException(status_code=500, detail='LIGHTNING_SIMULWHISPER_DIR is not set')

    entrypoint = Path(engine_root) / 'simulstreaming_whisper.py'
    if not entrypoint.exists():
        raise HTTPException(status_code=500, detail=f'Entrypoint not found: {entrypoint}')

    return (
        'Bridge server example is connected. '
        f'Audio file received: {Path(audio_path).name}. '
        f'Language={language}, model={model}. '
        'Replace run_engine_stub with a real Lightning-SimulWhisper subprocess adapter.'
    )


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8765)
