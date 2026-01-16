# AI Video - Facial Behavior Analysis Module

A lightweight client-server system for analyzing facial behavior during mock interviews using MediaPipe FaceMesh.

## Features
- **Client-side face detection** (no video sent to server)
- **Real-time eye contact tracking**
- **5-second calibration with futuristic scan animation**
- **Behavioral analysis** (looking away, smiling, head tilt)
- **LLM-powered narrative feedback** (mock implementation)

## Quick Start

### 1. Start the Server
```bash
cd server
python -m venv venv
.\venv\Scripts\activate   # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 2. Open the Client
Open `client/index.html` in a modern browser (Chrome/Edge recommended).

### 3. Usage
1. Click **Start Session**
2. Allow camera access
3. Wait for face detection → 5-second calibration scan
4. Answer questions (timer starts after calibration)
5. Click **Stop Session** to get feedback

## Architecture
```
client/          # Browser-based (HTML/JS)
├── index.html   # UI
├── app.js       # MediaPipe FaceMesh + logic
└── style.css    # Styling

server/          # Django backend
├── behavior_analysis/
│   ├── views.py      # API endpoints
│   ├── geometry.py   # Landmark math (yaw, smile, tilt)
│   ├── aggregator.py # Time-window aggregation
│   └── llm_handler.py # LLM integration (mock)
└── config/           # Django settings
```

## Tech Stack
- **Client**: MediaPipe FaceMesh, Vanilla JS
- **Server**: Django, NumPy
- **Privacy**: Only landmark coordinates sent, no video/images
