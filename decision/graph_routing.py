"""
Dynamic Evacuation Router: Applies risk-weighted Dijkstra algorithms to steer crowds away from dangerous zones.
Loads JSON map into a directed NetworkX graph and runs Dijkstra's algorithm.
Instead of just finding the physically shortest path, 
it uses a custom weight function to heavily penalize routes that force crowds through high-risk zones.
"""

import json
import networkx as nx

def load_venue_graph(json_path: str = "decision_data/venue_map.json") -> nx.DiGraph:
    """
    Loads the physical venue layout into a directed graph structure.
    """
    with open(json_path, "r") as f:
        data = json.load(f)
    
    G = nx.DiGraph()
    
    # Populate Nodes
    for node in data["nodes"]:
        G.add_node(
            str(node["id"]), 
            type=node["type"], 
            max_capacity=node["max_capacity"],
            name=node.get("name", ""),
            description=node.get("description", ""),
            coordinates=node.get("coordinates", {})
        )
        
    # Populate Edges
    for edge in data["edges"]:
        u, v, dist = edge["source"], edge["target"], edge["base_distance"]
        G.add_edge(u, v, base_distance=dist)
        
        # Add reverse path if the route is not strictly one-way
        if edge.get("bidirectional", True):
            G.add_edge(v, u, base_distance=dist)
            
    return G

def calculate_evacuation_route(G: nx.DiGraph, source: str, target: str, zone_risks: dict) -> list:
    """
    Calculates the shortest safe path. Edge weights are dynamically adjusted 
    based on the current risk level of the destination node.
    """
    def dynamic_weight(u, v, edge_data):
        base_dist = edge_data.get("base_distance", 10)
        # Default risk is now 0 (Normal)
        node_risk = zone_risks.get(v, 0) 
        
        # Exponential penalty for dangerous zones to force the algorithm to route around them
        if node_risk >= 3:
            return base_dist * 100 
        
        # Ensure a minimum weight multiplier of 1 for Normal (0) zones
        multiplier = max(1, node_risk)
        return base_dist * multiplier
        
    try:
        # NetworkX accepts a custom function for the 'weight' parameter
        return nx.dijkstra_path(G, str(source), str(target), weight=dynamic_weight)
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return [] # Return empty list if no safe path exists