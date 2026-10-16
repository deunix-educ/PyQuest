#!/usr/bin/env python3
"""Pré-génère la narration avec Piper : un mp3 par texte `explain` (voice: true) et par langue,
plus l'échantillon de voix des réglages (clé `voice.sample` des catalogues d'interface).

Fichiers produits : levels/<id>/audio/<lang>/<clé>.mp3 + manifest.json par niveau, et
app/assets/voice/<lang>/<clé>.mp3 + manifest.json pour l'échantillon.
Outil de build : nécessite `make voice` (environnement .venv-voice avec piper-tts, GPL, et ffmpeg).
Les voix utilisées et leurs licences sont documentées dans levels/AUDIO-CREDITS.md.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from voice_key import speech_key, speech_text

ROOT = Path(__file__).resolve().parent.parent
LEVELS_DIR = ROOT / "levels"
CACHE_DIR = ROOT / ".cache" / "piper-voices"
UI_AUDIO_DIR = ROOT / "app" / "assets" / "voice"
I18N_DIR = ROOT / "app" / "js" / "i18n"
SAMPLE_KEY = "voice.sample"

# Voix choisies pour leur licence (CC-BY 4.0 pour siwis, domaine public pour ljspeech).
VOICES = {"fr": "fr_FR-siwis-medium", "en": "en_US-ljspeech-high"}
# Débit légèrement ralenti (1.0 = normal) : public débutant.
LENGTH_SCALE = 1.1
# Niveau sonore cible commun à tous les fichiers (loudnorm), pour une écoute confortable.
FFMPEG_FILTER = "loudnorm=I=-18:TP=-2:LRA=7"


@dataclass(frozen=True)
class Job:
    group: str  # id de niveau, ou "ui" pour l'échantillon des réglages
    lang: str
    key: str
    text: str

    @property
    def base_dir(self) -> Path:
        return UI_AUDIO_DIR if self.group == "ui" else LEVELS_DIR / self.group / "audio"

    @property
    def path(self) -> Path:
        return self.base_dir / self.lang / f"{self.key}.mp3"


def collect_jobs() -> list[Job]:
    """Un job par texte `explain` à narrer et par langue disponible."""
    jobs: list[Job] = []
    for path in sorted(LEVELS_DIR.glob("*/level.yaml")):
        level: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
        for step in level.get("steps", []):
            if step.get("type") != "explain" or not step.get("voice"):
                continue
            for lang in VOICES:
                text = step["text"].get(lang)
                if text:
                    jobs.append(Job(level["id"], lang, speech_key(lang, text), speech_text(text)))
    for lang in VOICES:
        catalog: dict[str, str] = json.loads((I18N_DIR / f"{lang}.json").read_text(encoding="utf-8"))
        jobs.append(Job("ui", lang, speech_key(lang, catalog[SAMPLE_KEY]), speech_text(catalog[SAMPLE_KEY])))
    return jobs


def manifest_path(group: str) -> Path:
    return (UI_AUDIO_DIR if group == "ui" else LEVELS_DIR / group / "audio") / "manifest.json"


def read_manifest(group: str) -> dict[str, dict[str, dict[str, str]]]:
    path = manifest_path(group)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def is_current(job: Job, manifest: dict[str, dict[str, dict[str, str]]]) -> bool:
    entry = manifest.get(job.lang, {}).get(job.key)
    return job.path.exists() and entry is not None and entry["voice"] == VOICES[job.lang]


def synthesize(jobs: list[Job]) -> None:
    # Import tardif : piper-tts n'est installé que dans .venv-voice (make voice), pas dans .venv.
    from piper import PiperVoice, SynthesisConfig  # pyright: ignore[reportMissingImports]
    from piper.download_voices import download_voice  # pyright: ignore[reportMissingImports]

    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg est requis pour encoder les mp3.")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    voices: dict[str, Any] = {}
    config = SynthesisConfig(length_scale=LENGTH_SCALE)

    for job in jobs:
        if job.lang not in voices:
            model = CACHE_DIR / f"{VOICES[job.lang]}.onnx"
            if not model.exists():
                download_voice(VOICES[job.lang], CACHE_DIR)
            voices[job.lang] = PiperVoice.load(model)
        job.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = Path(tmp) / "speech.wav"
            with wave.open(str(wav_path), "wb") as wav_file:
                voices[job.lang].synthesize_wav(job.text, wav_file, config)
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1", "-af", FFMPEG_FILTER,
                 "-ar", "22050", "-c:a", "libmp3lame", "-b:a", "48k", str(job.path)],
                check=True,
            )
        print(f"  {job.group}/{job.lang}/{job.key}.mp3  ({job.path.stat().st_size // 1024} Ko)")


def write_manifests(jobs: list[Job]) -> None:
    """Écrit un manifeste par groupe et supprime les fichiers audio devenus orphelins."""
    by_group: dict[str, list[Job]] = {}
    for job in jobs:
        by_group.setdefault(job.group, []).append(job)
    audio_dirs = {UI_AUDIO_DIR, *LEVELS_DIR.glob("*/audio")}
    for audio_dir in audio_dirs:
        group = "ui" if audio_dir == UI_AUDIO_DIR else audio_dir.parent.name
        wanted = {job.path for job in by_group.get(group, [])}
        for mp3 in audio_dir.glob("*/*.mp3"):
            if mp3 not in wanted:
                mp3.unlink()
                print(f"  supprimé (orphelin) : {mp3.relative_to(ROOT)}")
        if group not in by_group and audio_dir.exists():
            shutil.rmtree(audio_dir)
    for group, group_jobs in by_group.items():
        manifest: dict[str, dict[str, dict[str, str]]] = {}
        for job in group_jobs:
            manifest.setdefault(job.lang, {})[job.key] = {"voice": VOICES[job.lang], "text": job.text}
        manifest_path(group).write_text(json.dumps(manifest, indent=4, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="vérifie sans générer ; code 1 si des fichiers manquent")
    parser.add_argument("--force", action="store_true", help="régénère tous les fichiers")
    args = parser.parse_args()

    jobs = collect_jobs()
    manifests = {group: read_manifest(group) for group in {job.group for job in jobs}}
    todo = jobs if args.force else [job for job in jobs if not is_current(job, manifests[job.group])]

    if args.check:
        for job in todo:
            print(f"manquant ou périmé : {job.group}/{job.lang}/{job.key}  « {job.text[:50]} »")
        print(f"{len(todo)} fichier(s) à générer sur {len(jobs)}.")
        return 1 if todo else 0

    print(f"{len(todo)} fichier(s) à générer sur {len(jobs)}.")
    synthesize(todo)
    write_manifests(jobs)
    return 0


if __name__ == "__main__":
    sys.exit(main())
