<div align="center">
  <img src="logo.svg" alt="CrowdShield Logo" width="100" />
</div>

# CrowdShield: Real-Time AI-Driven Crowd Safety & Stampede Prevention System

**Developed by Team The EdgeRunners**

CrowdShield is a platform designed to prevent stampedes and crowd crushes at mass gatherings using continuous computer vision, graph-based decision-making, and real-time distributed interfaces.

---

### Live Demo and Access

#### Demo Links

* **Authority Dashboard**: [View Live Deployment](https://rowdshield-dashboard.vercel.app/)

* **Attendee App**: [View Live Deployment](https://crowd-shield-one.vercel.app/)



#### Demo Access

* **Authority Dashboard Credentials**: Username: `admin` | Password: `crowd2026`

* **Attendee App Access Code**: `SHIELD2026`

---

### The Problem

Mass gatherings such as cultural events, religious pilgrimages, concerts, and sports events face serious risks of crowd crushes, bottlenecks, and stampedes. Traditional security relies heavily on human monitoring and static surveillance, making it difficult to detect sudden crowd-density spikes, dangerous movement patterns, or bottlenecks in real time. Emergency communication is also often delayed and limited to centralized, single-language announcements, leaving people unaware of hazards and safe evacuation routes. Therefore, there is a need for an autonomous, end-to-end system that can analyze live video, predict crowd risks, trigger physical interventions, and deliver timely, targeted alerts.

---

### Solution Overview

CrowdShield is an integrated crowd safety and intelligence platform designed to prevent stampede risks through continuous computer vision, graph-based decision-making, and real-time interfaces. Built on a decoupled, asynchronous microservices architecture, it processes high-frame-rate video through three interconnected analytical tiers:

* **Module 1 (Perception Engine)**: Uses YOLOv11 and ByteTrack for real-time person detection and tracking. It divides the venue into zones and continuously measures crowd density, speed, movement direction, entropy, and bottlenecks.
* **Module 2 (Decision & Recommendation Engine)**: Uses perception data with hysteresis-based rules, NetworkX graph routing, and Google Gemini for multilingual alerts. It optimizes gate operations, security deployment, evacuation routes, and emergency announcements.
* **Module 3 (User Interface Tier)**: Provides two interfaces: an Authority Dashboard for security personnel and an Attendee Mobile App for real-time navigation, location-based alerts, and safety checks.

---

### Tech Stack

* Computer Vision: PyTorch, YOLOv11s, ByteTrack, OpenCV-Headless  
* Backend & Algorithms: Python, FastAPI, NetworkX  
* LLM Integration: Google Gemini 2.5 Flash API  
* Frontend UIs: React, Vite  
* Deployment: Docker, Render (Backend), Vercel (Frontends)

---

### Directory structure

The repository is structured as a decoupled monorepo:

```text

CrowdShield/
├── CrowdShield_App/           # React/Vite source code for Attendee Mobile App
├── CrowdShield_Dashboard/     # React/Vite source code for Authority Dashboard
├── decision/                  # Core logic for routing, hysteresis, and rule evaluation
├── decision_data/             
├── perception/                # Vision pipeline, YOLO detection, and ByteTrack scripts
├── services/                  
├── .env.example               
├── .gitignore                 
├── Dockerfile                 
├── alerts.py                  # State management and API endpoints for UI notifications
├── main.py                    # Central FastAPI application entry point
├── requirements.txt           
└── yolo11s.pt
