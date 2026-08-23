"""
Safety Tracker: In-memory manager for mobile app alerts and sustained-risk user safety checks.
Tracks mobile-app-facing alerts and "confirm you are safe" safety checks.
In-memory only, no database.
"""

import uuid
import time
from collections import deque

SAFETY_CHECK_THRESHOLD = 4
ALERT_THRESHOLD = 3
PERSISTENCE_FRAMES = 3

_alerts = []
_active_safety_check = None
_risk_history = deque(maxlen=PERSISTENCE_FRAMES)


def _new_alert(risk_level, message, requires_ack):
    return {
        "id": str(uuid.uuid4()),
        "created_at": time.time(),
        "risk_level": risk_level,
        "message": message,
        "requires_ack": requires_ack,
        "resolved": False,
        "acknowledged_by": [],
    }


def _sustained_at_or_above(threshold):
    return len(_risk_history) == PERSISTENCE_FRAMES and all(r >= threshold for r in _risk_history)


def _sustained_below(threshold):
    return len(_risk_history) == PERSISTENCE_FRAMES and all(r < threshold for r in _risk_history)


def process_risk_update(risk_summary: dict):
    global _active_safety_check
    overall = risk_summary.get("overall_risk_level", 0)
    _risk_history.append(overall)

    if _sustained_at_or_above(SAFETY_CHECK_THRESHOLD):
        if _active_safety_check is None or _active_safety_check["resolved"]:
            alert = _new_alert(
                risk_level=overall,
                message="Conditions in your area have become high-risk. "
                        "Please move to a safe location and confirm you are safe.",
                requires_ack=True,
            )
            _alerts.insert(0, alert)
            _active_safety_check = alert

    elif _active_safety_check is not None and not _active_safety_check["resolved"]:
        if _sustained_below(SAFETY_CHECK_THRESHOLD):
            _active_safety_check["resolved"] = True
            _active_safety_check = None

    elif _sustained_at_or_above(ALERT_THRESHOLD):
        recent = _alerts[0] if _alerts else None
        if not recent or recent["resolved"] or recent["risk_level"] < overall:
            _alerts.insert(0, _new_alert(
                risk_level=overall,
                message="Crowd congestion is increasing near you. Please follow posted guidance.",
                requires_ack=False,
            ))


def get_active_alerts(limit: int = 10):
    return _alerts[:limit]


def get_pending_safety_check():
    if _active_safety_check and not _active_safety_check["resolved"]:
        return _active_safety_check
    return None


def acknowledge_safety_check(alert_id: str, device_id: str):
    for alert in _alerts:
        if alert["id"] == alert_id:
            if device_id not in alert["acknowledged_by"]:
                alert["acknowledged_by"].append(device_id)
            return alert
    return None