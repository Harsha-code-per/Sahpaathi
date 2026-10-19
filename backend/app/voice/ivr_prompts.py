"""The spoken menu at the end of an absentee call: replay, "my child understood", "we need help".

Spoken in the family's language when we can synthesise it. Santali has no TTS voice, so a Santali
home language falls back to the school language (Odia). These wordings need a native speaker's
review before they reach a parent (docs/TESTING_LOG.md).
"""

from pathlib import Path

from app.factory.schema import Episode, Lang
from app.voice.tts import TTSProvider

MENU: dict[str, str] = {
    "ta": "மீண்டும் கேட்க ஒன்றை அழுத்துங்கள். குழந்தை புரிந்துகொண்டது என்றால் இரண்டை அழுத்துங்கள். "
    "உதவி தேவை என்றால் மூன்றை அழுத்துங்கள்.",
    "hi": "फिर से सुनने के लिए एक दबाइए। अगर बच्चा समझ गया, तो दो दबाइए। अगर मदद चाहिए, तो तीन दबाइए।",
    "or": "ପୁଣି ଥରେ ଶୁଣିବାକୁ ଏକ ଦବାନ୍ତୁ। ପିଲା ବୁଝିଗଲେ ଦୁଇ ଦବାନ୍ତୁ। ସାହାଯ୍ୟ ଦରକାର ହେଲେ ତିନି ଦବାନ୍ତୁ।",
    "en": "Press 1 to hear it again. Press 2 if your child understood. Press 3 if you need help.",
}


def menu_lang(episode: Episode) -> Lang:
    """The home language, or the school language when the home language has no voice."""
    return episode.home_lang if episode.home_lang in MENU else episode.school_lang


def build_menu(episode: Episode, voice: TTSProvider, dst: Path) -> Path:
    lang = menu_lang(episode)
    return voice.synthesize(MENU[lang], lang, "guide", dst)
