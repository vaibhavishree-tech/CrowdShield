"""
Core API application- The backend server.
This is the central nervous system. 
It imports both stubs and ties them together in a single API endpoint that frontend can call.
Manages continuous asynchronous video processing and state endpoints
"""

import traceback
import torch
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from perception.tracker import process_frame  # Person 1's real perception logic
from decision.engine import decide
from dotenv import load_dotenv
#Add Pydantic model for incoming request validation
from pydantic import BaseModel
import threading
import time
from fastapi import HTTPException
import alerts

# Global variable to store the latest perception data
latest_perception_data = {}

class NotificationRequest(BaseModel):
    target: str      # e.g., "zone_1_PA", "all_staff", or "ground_security"
    message: str     # The broadcast message or alert text sent from the dashboard
class AcknowledgeRequest(BaseModel):
    device_id: str

load_dotenv()

app = FastAPI(title="Stampede Prediction Backend")

api_key = os.getenv("GEMINI_API_KEY")

try:
    llm_client = genai.Client(api_key=api_key) if api_key else None
except Exception as e:
    print(f"Warning: Could not initialize LLM Client. Running in offline fallback mode. Error: {e}")
    llm_client = None

# Enable CORS so the frontend can communicate without origin errors
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Force CPU mode for cloud deployment
device = "cuda" if torch.cuda.is_available() else "cpu"

def process_video_continuously():
    """
    Runs in the background. Reads the video at ~30 FPS and continuously
    updates the global state so the API always has fresh data.
    """
    global latest_perception_data
    while True:
        try:
            # 1. Process the next consecutive frame
            data,_ = process_frame(frame=None)
            
            # 2. Update the global state safely
            if data:
                latest_perception_data = data
                alerts.process_risk_update(data)
            else:
                print("[BACKGROUND WORKER] Warning: process_frame() returned empty data.")
        except Exception as e:
            print(f"[BACKGROUND WORKER ERROR] {e}")
            traceback.print_exc()
            
        # 3. Sleep slightly to mimic ~30 FPS and prevent CPU locking
        time.sleep(0.033)

# Start the video processing loop in a background thread when FastAPI starts
threading.Thread(target=process_video_continuously, daemon=True).start()

@app.get("/state")
def get_current_state():
    """
    The main endpoint polled by the frontend dashboard to retrieve 
    perception analytics and decision recommendations.
    """
    global latest_perception_data
    # Guard check: if video thread has not captured the first frame yet
    if not latest_perception_data:
        return {
            "risk_summary": {
                "timestamp": "",
                "zones": [],
                "overall_risk_level": 0,
                "overall_risk_label": "INITIALIZING",
                "highest_risk_zone": None
            },
            "recommendations": {},
        }

    # 1. Get perception data (simulating reading a video frame)
    perception_data = latest_perception_data
    
    # 2. Feed it to the decision engine
    recommendations = decide(perception_data, client=llm_client)

    # 3. Return the merged payload
    return {
        "risk_summary": perception_data,
        "recommendations": recommendations
    }

@app.get("/alerts")
def get_alerts():
    """Notification feed for the mobile app."""
    return {"alerts": alerts.get_active_alerts()}

@app.get("/safety-check")
def get_safety_check(device_id: str):
    """
    Mobile app polls this (same 2-3s cadence as /state).
    pending=True means THIS device has an unacknowledged critical alert
    and should show the blocking modal.
    """
    pending = alerts.get_pending_safety_check()
    if pending is None:
        return {"pending": False}

    already_ack = device_id in pending["acknowledged_by"]
    return {
        "pending": not already_ack,
        "alert_id": pending["id"],
        "message": pending["message"],
        "risk_level": pending["risk_level"],
    }

@app.post("/safety-check/{alert_id}/acknowledge")
def acknowledge(alert_id: str, body: AcknowledgeRequest):
    """Called when the user taps 'I am safe' on the blocking modal."""
    alert = alerts.acknowledge_safety_check(alert_id, body.device_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"acknowledged": True, "alert_id": alert_id}

# The /notify POST endpoint
# Alias /state/notify so frontend requests route smoothly
@app.post("/notify")
@app.post("/state/notify")
def send_notification(payload: NotificationRequest):
    """
    Handles manual or override alerts sent directly from the frontend dashboard.
    """
    print(f"[NOTIFICATION DISPATCH] Target: {payload.target} | Message: {payload.message}")
    
    # Optional: Integrate real SMS, PA system, or Webhook logic here
    # Example: send_pa_broadcast(payload.target, payload.message)
    
    return {
        "status": "success",
        "message": f"Notification successfully dispatched to {payload.target}",
        "sent_data": {
            "target": payload.target,
            "content": payload.message
        }
    }