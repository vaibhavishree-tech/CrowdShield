"""
Venue Heuristics: Stateful logic for automated gate control and proportional security staff distribution.
Rule-based logic for gate control and staff redistribution.
"""

import networkx as nx

def build_zone_risk_map(zones_data: list) -> dict:
    """
    Shared utility: converts Module 1's per-frame zones list into the flat
    {node_id: risk_level} dict that both graph_routing.py and this module need.
    Call this ONCE per frame in the backend loop, then pass the result to both.
    """
    return {z["zone_id"]: z.get("risk_level", 1) for z in zones_data}


def evaluate_gates_and_staff(
    G: nx.DiGraph,
    zone_risks: dict,
    risk_history: dict,
    critical_threshold: int = 4,
    persistence_frames: int = 3,
    total_staff_pool: int = 30,
    min_open_gates: int = 1,
) -> dict:
    gates_to_close = []
    gates_to_open = []
    staff_redistribution = []
    reasoning_log = []

    entry_exit_nodes = [n for n, d in G.nodes(data=True) if d.get("type") == "entry_exit"]
    exit_only_nodes = [n for n, d in G.nodes(data=True) if d.get("type") == "exit_only"]

    # --- Rule 1: Gate closure, using graph 'type', not string matching ---
    for node_id in entry_exit_nodes:
        risk = zone_risks.get(node_id, 1)
        history = risk_history.setdefault(node_id, [])
        history.append(risk)
        risk_history[node_id] = history[-persistence_frames:]

        sustained_critical = (
            len(risk_history[node_id]) >= persistence_frames
            and all(r >= critical_threshold for r in risk_history[node_id])
        )
        if sustained_critical:
            gates_to_close.append(node_id)
            reasoning_log.append(
                f"{node_id}: risk >= {critical_threshold} sustained "
                f"{persistence_frames} frames -> recommend close"
            )

    # --- Rule 2: Gate opening — candidates are entry_exit + exit_only, checked against own risk ---
    for node_id in entry_exit_nodes + exit_only_nodes:
        if node_id in gates_to_close:
            continue
        if zone_risks.get(node_id, 1) < critical_threshold:
            gates_to_open.append(node_id)

    # --- Safety guard: never drop below min_open_gates among entry_exit nodes ---
    if len(entry_exit_nodes) - len(gates_to_close) < min_open_gates:
        gates_to_close.sort(key=lambda g: zone_risks.get(g, 0))
        while gates_to_close and len(entry_exit_nodes) - len(gates_to_close) < min_open_gates:
            removed = gates_to_close.pop(0)
            reasoning_log.append(f"Override: kept {removed} open to preserve minimum {min_open_gates} open gate(s)")

    # --- Rule 3: Proportional staffing, capped to real pool ---
    raw_requests = [
        {"zone": node_id, "requested": risk * 2}
        for node_id, risk in zone_risks.items() if risk >= 3
    ]
    total_requested = sum(r["requested"] for r in raw_requests)
    if total_requested > total_staff_pool and total_requested > 0:
        scale = total_staff_pool / total_requested
        for r in raw_requests:
            staff_redistribution.append({"zone": r["zone"], "additional_staff": max(1, round(r["requested"] * scale))})
        reasoning_log.append(f"Staff demand ({total_requested}) exceeded pool ({total_staff_pool}); scaled proportionally")
    else:
        staff_redistribution = [{"zone": r["zone"], "additional_staff": r["requested"]} for r in raw_requests]

    if not reasoning_log:
        reasoning_log.append("System operating within normal parameters. All zones monitored.")

    return {
        "gates_to_close": gates_to_close,
        "gates_to_open": gates_to_open,
        "staff_redistribution": staff_redistribution,
        "reasoning": reasoning_log,
    }