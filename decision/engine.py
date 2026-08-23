"""
Module 2 Orchestrator: Bridges perception metrics with deterministic rules, dynamic routing, and LLM translations.
"""

from typing import Optional
import time
# Phase 2 Imports
from decision.graph_routing import load_venue_graph, calculate_evacuation_route
from decision.rules import build_zone_risk_map, evaluate_gates_and_staff

# Phase 3 Imports
from decision.recommendations import (
    CrowdMetricsInput,
    StructuredDecisionResponse,
    determine_event_type,
    build_conditional_actions,
    generate_safe_announcement
)
from services.llm_announcements import generate_multilingual_announcement_llm

from decision.recommendations import (
    CrowdMetricsInput,
    StructuredDecisionResponse,
    RecommendedAction,
    ActionType,         
    PriorityLevel,     
    determine_event_type,
    build_conditional_actions,
    generate_safe_announcement
)
# ---------------------------------------------------------
# 1. GLOBAL STATE INITIALIZATION (Persists across frames)
# ---------------------------------------------------------
venue_graph = load_venue_graph()
global_risk_history = {}

# State tracker to prevent spamming the LLM API on every frame
global_last_state = {
    "event_type": None,
    "risk_level": 0,
    "zone_id": None
}
# Caches the last generated translation to serve instantly 
global_cached_announcements = []

# Track the expiry time of the last high-risk event
global_cooldown_expiry = 0
COOLDOWN_SECONDS = 15

# ---------------------------------------------------------
# 2. THE CORE ORCHESTRATOR
# ---------------------------------------------------------
def decide(zones_json: dict, client: Optional[object] = None) -> dict:
    """
    Master Decision Engine.
    Processes raw perception metrics into deterministic paths, rule-based actions, 
    and state-triggered multilingual LLM broadcasts.
    """
    global global_last_state, global_cached_announcements, global_cooldown_expiry
    
    zones_data = zones_json.get("zones", [])
    # Convert all zone_ids to strings right at the top
    for zone in zones_data:
        zone["zone_id"] = str(zone["zone_id"])
    if not zones_data:
        return {}

    # --- A. PHASE 2: GRAPH ROUTING & RULES ---
    zone_risks = build_zone_risk_map(zones_data)
    
    # Evaluate stateful gate and staff distribution rules first 
    # (so we know which gates are actually open/closed for routing)
    rule_results = evaluate_gates_and_staff(
        G=venue_graph,
        zone_risks=zone_risks,
        risk_history=global_risk_history,
        critical_threshold=4,
        persistence_frames=3,
        total_staff_pool=30,
        min_open_gates=1
    )

    # --- B. DYNAMIC SOURCE/TARGET & HYSTERESIS ---
    # Only filter zones that have active risk (> 0).
    active_risk_zones = [z for z in zones_data if z.get("risk_level", 0) > 0]
    current_time = time.time()
    if active_risk_zones:
        critical_zone = max(active_risk_zones, key=lambda z: (z.get("risk_level", 0), z.get("density", 0.0)))
        critical_zone_id = critical_zone.get("zone_id")
        raw_risk_level = critical_zone.get("risk_level", 0)
    else:
        # Venue is completely normal — clear critical flags
        critical_zone = {}
        critical_zone_id = None
        raw_risk_level = 0

    # Initialize current_risk_level using raw_risk_level as baseline
    current_risk_level = raw_risk_level

    # HYSTERESIS LOGIC: Lock the risk level if we are in a cooldown
    if raw_risk_level >= 2:
        # Reset the timer as long as the risk is high
        global_cooldown_expiry = current_time + COOLDOWN_SECONDS
    else:
        if current_time < global_cooldown_expiry:
            # Artificially maintain the previous high state to prevent UI flickering
            current_risk_level = global_last_state["risk_level"]
            critical_zone_id = global_last_state.get("zone_id") or critical_zone_id
        else:
            # Cooldown expired: resolve to normal (0)
            current_risk_level = 0

    alt_gates = rule_results.get("gates_to_open", [])
    has_alt = len(alt_gates) > 0
    
    safe_exit_id = alt_gates[0] if has_alt else "3" # Fallback to Zone 3 (Exit)
    safe_exit_display = alt_gates[0] if has_alt else "nearest exit"

    # Only calculate an evacuation path if there is an active risk zone
    if critical_zone_id:
        safe_route = calculate_evacuation_route(
            G=venue_graph, 
            source=critical_zone_id, 
            target=safe_exit_id, 
            zone_risks=zone_risks
        )
    else:
        safe_route = []

    # --- C. PHASE 3: SEMANTIC EVENT INFERENCE ---
    metrics_input = CrowdMetricsInput(
        zone_id=critical_zone_id or "0",
        risk_level=current_risk_level,
        density=critical_zone.get("density", 0.0),
        density_trend=critical_zone.get("density_trend", 0.0),
        avg_speed=critical_zone.get("avg_speed", 1.0),
        flow_direction=critical_zone.get("flow_direction", [0.0, 0.0]),
        inflow=critical_zone.get("inflow", 0),
        outflow=critical_zone.get("outflow", 0),
        flow_entropy=critical_zone.get("flow_entropy", 0.0),
        bottleneck=critical_zone.get("bottleneck", False)
    )
    
    current_event_type = determine_event_type(metrics_input)

    # --- D. GATE CLOSURE TARGET ---
    closed_gates = rule_results.get("gates_to_close", [])
    primary_closed_gate = closed_gates[0] if closed_gates else (critical_zone_id or "None")
    # If the system is in normal operations, clear out zone-specific actions
    if current_risk_level == 0:
        recommended_actions = [
            RecommendedAction(
                action=ActionType.MONITOR,
                priority=PriorityLevel.LOW,
                target="All Zones",
                message="System operating normally. Continue standard visual monitoring across all zones."
            )
        ]
    else:
        recommended_actions = build_conditional_actions(
            event_type=current_event_type,
            risk_level=metrics_input.risk_level,
            alternative_gate_available=has_alt,
            target_zone=metrics_input.zone_id,
            safe_exit=safe_exit_display,
            rule_results=rule_results
        )

    # --- E. STATE-DRIVEN LLM ANNOUNCEMENTS ---
    state_changed = (
        current_event_type != global_last_state["event_type"] or 
        abs(metrics_input.risk_level - global_last_state["risk_level"]) >= 1
    )

    if state_changed or not global_cached_announcements:
        if current_event_type == "NORMAL_OPERATIONS":
            global_cached_announcements = [
                {
                    "language": "en",
                    "message": "System operating within normal parameters. All zones clear."
                }
            ]
        else:
            context_data = {
                "zone_id": metrics_input.zone_id,
                "target_gate": primary_closed_gate,
                "safe_exit": safe_exit_display
            }
            
            english_base_list = generate_safe_announcement(current_event_type, context_data)
            safe_english_message = english_base_list[0].message if english_base_list else ""
            
            global_cached_announcements = generate_multilingual_announcement_llm(
                english_message=safe_english_message,
                event_type=current_event_type,
                context_data=context_data,
                client=client,
                timeout_seconds=1.5
            )
        
        global_last_state["event_type"] = current_event_type
        global_last_state["risk_level"] = metrics_input.risk_level
        global_last_state["zone_id"] = metrics_input.zone_id

    # --- MERGE MODULE 1 VISION REASONS INTO REASONING LOG ---
    combined_reasoning = list(rule_results.get("reasoning", []))
    vision_reasons = critical_zone.get("risk_reasons", []) if critical_zone else []
    if vision_reasons and critical_zone_id:
        combined_reasoning.append(
            f"Vision Alert (Zone {critical_zone_id}): {', '.join(vision_reasons)}"
        )
    elif current_risk_level == 0:
        combined_reasoning.append("System operating within normal parameters. All zones monitored.")

    # --- F. RETURN STRICT JSON CONTRACT TO FRONTEND ---
    response = StructuredDecisionResponse(
        event_type=current_event_type,
        zone_id=metrics_input.zone_id,
        risk_level=metrics_input.risk_level,
        recommended_actions=recommended_actions,
        target_gates=rule_results.get("gates_to_close", []) + rule_results.get("gates_to_open", []),
        evacuation_route=safe_route,
        staff_deployment=dict(
            (item["zone"], item["additional_staff"]) 
            for item in rule_results.get("staff_redistribution", [])
        ),
        announcements=global_cached_announcements,
        reasoning_log=combined_reasoning
    )

    return response.model_dump()