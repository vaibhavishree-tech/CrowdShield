"""
Action Engine: Strict Pydantic schemas mapping raw metrics to prioritized, UI-ready safety actions.
"""

from enum import Enum
from typing import List, Dict, Optional
from pydantic import BaseModel, Field

# ---------------------------------------------------------
# 1. ENUMS FOR STRICT TYPING
# ---------------------------------------------------------
class EventType(str, Enum):
    CAPACITY_WARNING = "CAPACITY_WARNING"
    BOTTLENECK_WARNING = "BOTTLENECK_WARNING"
    SUDDEN_SURGE = "SUDDEN_SURGE"
    ABNORMAL_FLOW = "ABNORMAL_FLOW"
    GATE_CLOSURE = "GATE_CLOSURE"
    GENERAL_EVACUATION = "GENERAL_EVACUATION"

class ActionType(str, Enum):
    MONITOR = "MONITOR"
    REDIRECT_CROWD = "REDIRECT_CROWD"
    OPEN_GATE = "OPEN_GATE"
    CLOSE_GATE = "CLOSE_GATE"
    RESTRICT_ENTRY = "RESTRICT_ENTRY"
    DEPLOY_SECURITY = "DEPLOY_SECURITY"
    BROADCAST_MESSAGE = "BROADCAST_MESSAGE"
    EVACUATE = "EVACUATE"

class PriorityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

# ---------------------------------------------------------
# 2. PYDANTIC MODELS FOR STRICT INPUT / OUTPUT CONTRACTS
# ---------------------------------------------------------

# FIX 2: Pure observation metrics from Person 1 (No event_type)
class CrowdMetricsInput(BaseModel):
    zone_id: str
    risk_level: int = Field(..., ge=0, le=5)
    density: float = Field(..., ge=0, le=1)
    density_trend: float
    avg_speed: float = Field(..., ge=0)
    flow_direction: List[float]
    inflow: int = Field(..., ge=0)
    outflow: int = Field(..., ge=0)
    flow_entropy: float = Field(..., ge=0)
    bottleneck: bool

# FIX 5: Structured, prioritized actions for the frontend UI
class RecommendedAction(BaseModel):
    action: ActionType
    priority: PriorityLevel
    target: Optional[str] = None
    message: Optional[str] = None

class MultilingualAnnouncement(BaseModel):
    language: str
    message: str

class StructuredDecisionResponse(BaseModel):
    event_type: EventType
    zone_id: str
    risk_level: int
    recommended_actions: List[RecommendedAction] = Field(default_factory=list)
    # FIX 1: Fixed mutable defaults using Field(default_factory=...)
    target_gates: List[str] = Field(default_factory=list)
    evacuation_route: List[str] = Field(default_factory=list)
    staff_deployment: Dict[str, int] = Field(default_factory=dict)
    announcements: List[MultilingualAnnouncement] = Field(default_factory=list)
    reasoning_log: List[str] = Field(default_factory=list)


# ---------------------------------------------------------
# 3. ACTION RECOMMENDATION MATRIX (FIX 3)
# ---------------------------------------------------------
RECOMMENDATION_TEMPLATES: Dict[EventType, Dict[int, List[ActionType]]] = {
    EventType.CAPACITY_WARNING: {
        1: [ActionType.MONITOR],
        2: [ActionType.MONITOR, ActionType.REDIRECT_CROWD],
        3: [ActionType.REDIRECT_CROWD, ActionType.DEPLOY_SECURITY],
        4: [ActionType.RESTRICT_ENTRY, ActionType.REDIRECT_CROWD, ActionType.DEPLOY_SECURITY]
    },
    EventType.BOTTLENECK_WARNING: {
        1: [ActionType.MONITOR],
        2: [ActionType.REDIRECT_CROWD],
        3: [ActionType.REDIRECT_CROWD, ActionType.DEPLOY_SECURITY, ActionType.BROADCAST_MESSAGE],
        4: [ActionType.REDIRECT_CROWD, ActionType.OPEN_GATE, ActionType.DEPLOY_SECURITY, ActionType.BROADCAST_MESSAGE]
    },
    EventType.SUDDEN_SURGE: {
        2: [ActionType.MONITOR, ActionType.RESTRICT_ENTRY],
        3: [ActionType.RESTRICT_ENTRY, ActionType.REDIRECT_CROWD, ActionType.DEPLOY_SECURITY],
        4: [ActionType.RESTRICT_ENTRY, ActionType.REDIRECT_CROWD, ActionType.DEPLOY_SECURITY, ActionType.BROADCAST_MESSAGE]
    },
    EventType.ABNORMAL_FLOW: {
        2: [ActionType.MONITOR, ActionType.DEPLOY_SECURITY],
        3: [ActionType.REDIRECT_CROWD, ActionType.DEPLOY_SECURITY, ActionType.BROADCAST_MESSAGE],
        4: [ActionType.RESTRICT_ENTRY, ActionType.REDIRECT_CROWD, ActionType.DEPLOY_SECURITY, ActionType.BROADCAST_MESSAGE]
    },
    EventType.GENERAL_EVACUATION: {
        4: [ActionType.EVACUATE, ActionType.OPEN_GATE, ActionType.DEPLOY_SECURITY, ActionType.BROADCAST_MESSAGE]
    }
}


# ---------------------------------------------------------
# 4. ANNOUNCEMENT TEMPLATE BANK
# ---------------------------------------------------------
ANNOUNCEMENT_TEMPLATES: Dict[EventType, Dict[str, str]] = {
    EventType.CAPACITY_WARNING: {
        "en": "Notice: High capacity reached at Zone {zone_id}. Please follow staff guidance for redirection.",
        "hi": "सूचना: Zone {zone_id} में उच्च क्षमता पहुँच गई है। कृपया कर्मचारियों के निर्देशों का पालन करें।",
        "or": "ସୂଚନା: Zone {zone_id} ରେ ଅଧିକ କ୍ଷମତା ପହଞ୍ଚିଛି। ଦୟାକରି କର୍ମଚାରୀଙ୍କ ନିର୍ଦ୍ଦେଶ ପାଳନ କରନ୍ତୁ।"
    },
    EventType.BOTTLENECK_WARNING: {
        "en": "Congestion alert at Zone {zone_id}. Movement is restricted. Please proceed toward alternative exit {safe_exit}.",
        "hi": "Zone {zone_id} पर भीड़भाड़ की चेतावनी। आवाजाही सीमित है। कृपया वैकल्पिक निकास {safe_exit} की ओर बढ़ें।",
        "or": "Zone {zone_id} ରେ ଭିଡ଼ ଚେତାବନୀ। ଦୟାକରି ବିକଳ୍ପ ପ୍ରସ୍ଥାନ {safe_exit} ଆଡକୁ ଯାଆନ୍ତୁ।"
    },
    EventType.SUDDEN_SURGE: {
        "en": "Caution: Sudden crowd surge observed near Zone {zone_id}. Entry is temporarily restricted.",
        "hi": "सावधान: Zone {zone_id} के पास अचानक भीड़ बढ़ गई है। प्रवेश अस्थायी रूप से प्रतिबंधित है।",
        "or": "ସତର୍କତା: Zone {zone_id} ନିକଟରେ ହଠାତ୍ ଭିଡ଼ ବୃଦ୍ଧି ପାଇଛି।"
    },
    EventType.ABNORMAL_FLOW: {
        "en": "Warning: Irregular movement patterns detected in Zone {zone_id}. Follow security instructions immediately.",
        "hi": "चेतावनी: Zone {zone_id} में अनियमित आवाजाही का पता चला है। तुरंत सुरक्षा कर्मचारियों के निर्देशों का पालन करें।",
        "or": "ଚେତାବନୀ: Zone {zone_id} ରେ ଅନିୟମିତ ଗତିବିଧି ଚିହ୍ନଟ ହୋଇଛି।"
    },
    EventType.GATE_CLOSURE: {
        "en": "Safety Notice: gate {target_gate} is temporarily closed due to high congestion. Please proceed to {safe_exit}.",
        "hi": "सुरक्षा सूचना: अत्यधिक भीड़ के कारण gate {target_gate} अस्थायी रूप से बंद है। कृपया {safe_exit} का उपयोग करें।",
        "or": "ସୁରକ୍ଷା ସୂଚନା: ଅଧିକ ଭିଡ଼ ହେତୁ gate {target_gate} ଅସ୍ଥାୟୀ ଭାବରେ ବନ୍ଦ ଅଛି।"
    },
    EventType.GENERAL_EVACUATION: {
        "en": "EMERGENCY: General evacuation in progress. Proceed calmly along the safe route toward gate {safe_exit}.",
        "hi": "आपातकाल: सामान्य निकासी जारी है। सुरक्षित मार्ग से gate {safe_exit} की ओर बढ़ें।",
        "or": "ଜରୁରୀକାଳୀନ ପରିସ୍ଥିତି: ସାଧାରଣ ଖାଲି କରିବା ପ୍ରକ୍ରିୟା ଚାଲିଛି।"
    }
}


# ---------------------------------------------------------
# 5. HELPER UTILITIES
# ---------------------------------------------------------
def determine_event_type(metrics: CrowdMetricsInput) -> EventType:
    """
    Infers the semantic EventType from raw crowd metrics observations.
    """
    if metrics.risk_level == 4 and metrics.density >= 0.90:
        return EventType.GENERAL_EVACUATION

    # Gate Closure condition: matches gate IDs "7", "9", or any ID string containing "gate"
    is_gate_node = metrics.zone_id in ["7", "9"] or "gate" in metrics.zone_id.lower()
    # Gate Closure condition check
    if is_gate_node and metrics.risk_level >= 3 and metrics.bottleneck:
        return EventType.GATE_CLOSURE
        
    if metrics.bottleneck and metrics.avg_speed < 0.40 and (metrics.inflow > metrics.outflow):
        return EventType.BOTTLENECK_WARNING
        
    if metrics.density_trend >= 0.12 or metrics.inflow > (metrics.outflow * 2):
        return EventType.SUDDEN_SURGE
        
    if metrics.flow_entropy > 0.65:
        return EventType.ABNORMAL_FLOW
        
    if metrics.density >= 0.75:
        return EventType.CAPACITY_WARNING
        
    return EventType.CAPACITY_WARNING

def build_conditional_actions(
    event_type: EventType, 
    risk_level: int, 
    alternative_gate_available: bool,
    target_zone: str,
    safe_exit: Optional[str] = None,
    rule_results: Optional[dict] = None
) -> List[RecommendedAction]:
    actions: List[RecommendedAction] = []
    rule_results = rule_results or {}

    # --- ADD THIS GUARD CHECK AT THE TOP OF THE FUNCTION ---
    if risk_level == 0:
        return [
            RecommendedAction(
                action=ActionType.MONITOR,
                priority=PriorityLevel.LOW,
                target="All Zones",
                message="System operating normally. Continue standard visual monitoring across all zones."
            )
        ]
    # --------------------------------------------------------
    
    priority = PriorityLevel.CRITICAL if risk_level >= 4 else (
        PriorityLevel.HIGH if risk_level == 3 else (
            PriorityLevel.MEDIUM if risk_level == 2 else PriorityLevel.LOW
        )
    )

    # 1. Gate Closure / Opening Actions from Rules
    for gate in rule_results.get("gates_to_close", []):
        actions.append(RecommendedAction(
            action=ActionType.CLOSE_GATE,
            priority=PriorityLevel.CRITICAL,
            target=f"Gate {gate}",
            message=f"Close Gate {gate} immediately to prevent incoming crowd pressure."
        ))

    for gate in rule_results.get("gates_to_open", []):
        if gate != target_zone:
            actions.append(RecommendedAction(
                action=ActionType.OPEN_GATE,
                priority=PriorityLevel.HIGH,
                target=f"Gate {gate}",
                message=f"Open alternative Gate {gate} to relieve pressure from Zone {target_zone}."
            ))

    # 2. Specific Staff Deployment with Actual Calculated Counts
    staff_map = {item["zone"]: item["additional_staff"] for item in rule_results.get("staff_redistribution", [])}
    if target_zone in staff_map:
        count = staff_map[target_zone]
        actions.append(RecommendedAction(
            action=ActionType.DEPLOY_SECURITY,
            priority=priority,
            target=f"Zone {target_zone}",
            message=f"Dispatch {count} additional security personnel to Zone {target_zone} for manual crowd control."
        ))

    # 3. Domain-Specific Crowd Redirection
    if safe_exit and safe_exit != target_zone:
        actions.append(RecommendedAction(
            action=ActionType.REDIRECT_CROWD,
            priority=priority,
            target=f"Zone {target_zone}",
            message=f"Set up directional barriers in Zone {target_zone} guiding crowds toward Exit {safe_exit}."
        ))

    # 4. Fallback Matrix for remaining general advice
    base_action_types = RECOMMENDATION_TEMPLATES.get(event_type, {}).get(risk_level, [ActionType.MONITOR])
    existing_action_types = {a.action for a in actions}

    for act in base_action_types:
        if act not in existing_action_types and act != ActionType.BROADCAST_MESSAGE:
            actions.append(RecommendedAction(
                action=act,
                priority=priority,
                target=f"Zone {target_zone}",
                message=f"Initiate {act.value.lower().replace('_', ' ')} protocol for Zone {target_zone}."
            ))
            
    return actions


def generate_safe_announcement(event_type: EventType, context_data: dict) -> List[MultilingualAnnouncement]:
    """
    Safely formats pre-vetted multilingual announcement templates using runtime variables.
    """
    templates = ANNOUNCEMENT_TEMPLATES.get(event_type, ANNOUNCEMENT_TEMPLATES[EventType.CAPACITY_WARNING])
    results = []
    
    for lang, template_str in templates.items():
        try:
            formatted_msg = template_str.format(**context_data)
        except KeyError:
            # Safe fallback if placeholder key isn't provided
            formatted_msg = template_str.replace("{zone_id}", context_data.get("zone_id", "the area"))
            formatted_msg = formatted_msg.replace("{target_gate}", context_data.get("target_gate", "the gate"))
            formatted_msg = formatted_msg.replace("{safe_exit}", context_data.get("safe_exit", "nearest exit"))
            
        results.append(MultilingualAnnouncement(language=lang, message=formatted_msg))
        
    return results