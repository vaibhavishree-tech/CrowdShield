"""
Broadcast Service: Schema-enforced multilingual LLM translations with robust local dictionary fallbacks.
"""

import json
import re
import logging
from typing import List, Dict, Optional
from pydantic import BaseModel, Field, ValidationError

# Import Pydantic model and local fallback templates from decision/recommendations.py
from decision.recommendations import (
    MultilingualAnnouncement,
    EventType,
    ANNOUNCEMENT_TEMPLATES
)

# Set up logger for tracking API fallbacks
logger = logging.getLogger("LLM_Announcements")

# ---------------------------------------------------------
# 1. PYDANTIC RESPONSE SCHEMA FOR STRUCTURED OUTPUT
# ---------------------------------------------------------
class TranslationPayload(BaseModel):
    hi: str = Field(description="Translation in Hindi")
    or_: str = Field(alias="or", description="Translation in Odia")
    bn: str = Field(description="Translation in Bengali")


# ---------------------------------------------------------
# 2. STRICT SYSTEM PROMPT
# ---------------------------------------------------------
SYSTEM_PROMPT = """You are an automated emergency broadcast translation system for public crowd safety.
Your ONLY task is to translate the provided verified English safety message into Hindi (hi), Odia (or), and Bengali (bn).

STRICT SAFETY CONSTRAINTS:
1. Do NOT add any conversational fluff, greetings, notes, explanations, or Markdown intro/outro.
2. Do NOT alter, hallucinate, or omit any names, zone identifiers, gate numbers, or safety instructions.
3. Keep the tone urgent, clear, calm, and grammatically precise for public address systems.
4. Output MUST strictly be a valid JSON object matching this key structure:
   {"hi": "...", "or": "...", "bn": "..."}
"""

# ---------------------------------------------------------
# 3. STATIC LOCAL FALLBACK GENERATOR
# ---------------------------------------------------------
def _get_local_fallback(event_type: EventType, context_data: dict) -> List[MultilingualAnnouncement]:
    """
    Fallback mechanism that pulls local pre-translated dictionary strings 
    if the API call times out, fails, or is offline.
    """
    templates = ANNOUNCEMENT_TEMPLATES.get(
        event_type, 
        ANNOUNCEMENT_TEMPLATES[EventType.CAPACITY_WARNING]
    )
    
    results = []
    for lang_code, template_str in templates.items():
        try:
            formatted_msg = template_str.format(**context_data)
        except KeyError:
            # Safe replacement fallback if placeholder is missing
            formatted_msg = template_str.replace("{zone_id}", context_data.get("zone_id", "the area"))
            formatted_msg = formatted_msg.replace("{target_gate}", context_data.get("target_gate", "the gate"))
            formatted_msg = formatted_msg.replace("{safe_exit}", context_data.get("safe_exit", "nearest exit"))
            
        results.append(MultilingualAnnouncement(language=lang_code, message=formatted_msg))
        
    return results


# ---------------------------------------------------------
# 4. MAIN TRANSLATION SERVICE FUNCTION
# ---------------------------------------------------------
def generate_multilingual_announcement_llm(
    english_message: str,
    event_type: EventType,
    context_data: dict,
    client: Optional[object] = None,
    timeout_seconds: float = 1.5
) -> List[MultilingualAnnouncement]:
    """
    Translates an approved English safety message using an LLM API.
    Uses strict schema validation and falls back gracefully to local templates on error or timeout.
    """
    # 1. Return safe English immediately if message is empty
    if not english_message:
        return _get_local_fallback(event_type, context_data)

    # 2. Base list always starts with the verified English source message
    announcements = [
        MultilingualAnnouncement(language="en", message=english_message)
    ]

    # 3. Check if LLM client is available
    if not client:
        logger.warning("No LLM API client provided. Using local pre-translated fallbacks.")
        return _get_local_fallback(event_type, context_data)

    try:
        raw_json_str = ""

        # --- OPTION A: INTEGRATION WITH GOOGLE GEMINI API ---
        if hasattr(client, "models"):
            # Using Google GenAI SDK (e.g. gemini-2.5-flash)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"Translate this exact message:\n\n{english_message}",
                config={
                    "system_instruction": SYSTEM_PROMPT,
                    "response_mime_type": "application/json",
                    "response_schema": TranslationPayload,
                    "temperature": 0.0  # Zero temperature for deterministic output
                }
            )
            raw_json_str = response.text

        # --- OPTION B: GENERIC OPENAI-LIKE CLIENT (Fallback Interface) ---
        elif hasattr(client, "chat"):
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Translate this exact message:\n\n{english_message}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.0,
                timeout=timeout_seconds
            )
            raw_json_str = response.choices[0].message.content

        # 4. REGEX CLEANUP: Strip away accidental Markdown blocks (e.g., ```json ... ```)
        cleaned_json = re.sub(r"^```json\s*", "", raw_json_str.strip(), flags=re.MULTILINE)
        cleaned_json = re.sub(r"```$", "", cleaned_json.strip(), flags=re.MULTILINE)

        # 5. PYDANTIC VALIDATION: Enforce strict contract
        parsed_data = TranslationPayload.model_validate(
            json.loads(cleaned_json)
        )
        
        # 6. Append validated translations using the strictly parsed properties
        announcements.extend([
            MultilingualAnnouncement(
                language="hi",
                message=parsed_data.hi
            ),
            MultilingualAnnouncement(
                language="or",
                message=parsed_data.or_
            ),
            MultilingualAnnouncement(
                language="bn",
                message=parsed_data.bn
            )
        ])

        return announcements

    except ValidationError as ve:
        logger.error(f"LLM returned incomplete or invalid schema: {ve}. Falling back.")
        return _get_local_fallback(event_type, context_data)
    except Exception as e:
        logger.error(f"LLM translation failed or timed out ({str(e)}). Falling back to local templates.")
        return _get_local_fallback(event_type, context_data)