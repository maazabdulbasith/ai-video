// =============================================================================
// DOM Elements
// =============================================================================
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDisplay = document.getElementById('connectionStatus');
const packetDisplay = document.getElementById('packetCount');
const timerDisplay = document.getElementById('timer');
const eyeContactDisplay = document.getElementById('eyeContactPct');
const calibrationStatusDiv = document.getElementById('calibrationStatus');
const calibrationProgressDisplay = document.getElementById('calibrationProgress');

// =============================================================================
// State
// =============================================================================
let isRunning = false;
let isCalibrating = false;
let isWaitingForFace = false; // Waiting for camera to detect a face
let startTime = 0;
let packetCounter = 0;
let frameBuffer = [];
let pendingQueue = []; // For retry queue (localStorage backup)
let camera = null;
let timerInterval = null;
let sendingInterval = null;

// Calibration state
let calibrationFrames = [];
let baselineYaw = 0;
const CALIBRATION_DURATION_MS = 5000; // 5 seconds

// Real-time eye contact tracking
let eyeContactFrames = 0;
let totalFrames = 0;

// Scan animation state (first 5 seconds of session)
let scanAnimationEndTime = 0;
const SCAN_ANIMATION_DURATION_MS = 5000;

// =============================================================================
// MediaPipe Constants (Landmark Indices)
// These are standard 468-point FaceMesh indices
// =============================================================================
const LANDMARKS = {
    NOSE_TIP: 1,
    LEFT_EAR: 234,
    RIGHT_EAR: 454,
    MOUTH_LEFT: 61,
    MOUTH_RIGHT: 291,
    CHIN: 152,
    FOREHEAD: 10
};

// =============================================================================
// Configuration
// =============================================================================
const SERVER_URL = 'http://localhost:8000/api';
const BATCH_INTERVAL_MS = 1000; // Send data every 1 second
const YAW_THRESHOLD = 0.08; // Threshold for "looking away" (client-side preview)
const QUEUE_STORAGE_KEY = 'behavior_analysis_pending_queue';

// =============================================================================
// Retry Queue (localStorage)
// =============================================================================
function loadPendingQueue() {
    try {
        const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
        if (stored) {
            pendingQueue = JSON.parse(stored);
            console.log(`Loaded ${pendingQueue.length} pending batches from storage`);
        }
    } catch (e) {
        console.warn("Could not load pending queue:", e);
        pendingQueue = [];
    }
}

function savePendingQueue() {
    try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(pendingQueue));
    } catch (e) {
        console.warn("Could not save pending queue:", e);
    }
}

function clearPendingQueue() {
    pendingQueue = [];
    localStorage.removeItem(QUEUE_STORAGE_KEY);
}

// =============================================================================
// FaceMesh Setup (Pinned Version)
// =============================================================================
function onResults(results) {
    const width = canvasElement.width;
    const height = canvasElement.height;
    const now = Date.now();
    const showScanAnimation = now < scanAnimationEndTime;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.drawImage(results.image, 0, 0, width, height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // === TRIGGER CALIBRATION ON FIRST FACE DETECTION ===
        if (isWaitingForFace) {
            isWaitingForFace = false;
            startCalibration();
        }

        // === PREMIUM FUTURISTIC SCAN (During calibration) ===
        if (showScanAnimation && (isCalibrating || isRunning)) {
            const elapsed = SCAN_ANIMATION_DURATION_MS - (scanAnimationEndTime - now);
            const progress = Math.min(elapsed / SCAN_ANIMATION_DURATION_MS, 1);
            const pulsePhase = (now % 800) / 800;
            const pulse = 0.6 + Math.sin(pulsePhase * Math.PI * 2) * 0.4;

            // === HIGH-RESOLUTION MESH WITH GLOW ===
            // Outer glow layer (blur effect simulation)
            canvasCtx.shadowColor = 'rgba(0, 255, 255, 0.8)';
            canvasCtx.shadowBlur = 15;

            // Sharp cyan tesselation mesh
            drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {
                color: `rgba(0, 220, 255, ${0.15 + pulse * 0.15})`,
                lineWidth: 0.5
            });

            // Reset shadow for crisp lines
            canvasCtx.shadowBlur = 8;

            // === FEATURE HIGHLIGHTING ===
            // Eyes - bright cyan with glow
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, {
                color: `rgba(0, 255, 255, ${0.7 + pulse * 0.3})`,
                lineWidth: 2
            });
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, {
                color: `rgba(0, 255, 255, ${0.7 + pulse * 0.3})`,
                lineWidth: 2
            });
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYEBROW, {
                color: `rgba(100, 200, 255, ${0.5 + pulse * 0.3})`,
                lineWidth: 1.5
            });
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYEBROW, {
                color: `rgba(100, 200, 255, ${0.5 + pulse * 0.3})`,
                lineWidth: 1.5
            });

            // Face oval - strong teal outline
            canvasCtx.shadowColor = 'rgba(0, 255, 200, 0.9)';
            canvasCtx.shadowBlur = 12;
            drawConnectors(canvasCtx, landmarks, FACEMESH_FACE_OVAL, {
                color: `rgba(0, 255, 180, ${0.8 + pulse * 0.2})`,
                lineWidth: 3
            });

            // Lips - subtle warm accent
            canvasCtx.shadowColor = 'rgba(255, 100, 150, 0.6)';
            canvasCtx.shadowBlur = 6;
            drawConnectors(canvasCtx, landmarks, FACEMESH_LIPS, {
                color: `rgba(255, 120, 150, ${0.6 + pulse * 0.2})`,
                lineWidth: 2
            });

            // Reset shadow
            canvasCtx.shadowBlur = 0;
            canvasCtx.shadowColor = 'transparent';

            // === SCAN LINE EFFECT ===
            const scanY = ((now % 1500) / 1500) * height;
            const gradient = canvasCtx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
            gradient.addColorStop(0, 'rgba(0, 255, 255, 0)');
            gradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.9)');
            gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(0, scanY - 30, width, 60);

            // Sharp scan line
            canvasCtx.beginPath();
            canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            canvasCtx.lineWidth = 2;
            canvasCtx.moveTo(0, scanY);
            canvasCtx.lineTo(width, scanY);
            canvasCtx.stroke();

            // === CORNER BRACKETS (Targeting reticle) ===
            const bracketSize = 40;
            const bracketThickness = 3;
            canvasCtx.strokeStyle = `rgba(0, 255, 255, ${0.8 + pulse * 0.2})`;
            canvasCtx.lineWidth = bracketThickness;

            // Top-left
            canvasCtx.beginPath();
            canvasCtx.moveTo(20, 20 + bracketSize);
            canvasCtx.lineTo(20, 20);
            canvasCtx.lineTo(20 + bracketSize, 20);
            canvasCtx.stroke();

            // Top-right
            canvasCtx.beginPath();
            canvasCtx.moveTo(width - 20 - bracketSize, 20);
            canvasCtx.lineTo(width - 20, 20);
            canvasCtx.lineTo(width - 20, 20 + bracketSize);
            canvasCtx.stroke();

            // Bottom-left
            canvasCtx.beginPath();
            canvasCtx.moveTo(20, height - 20 - bracketSize);
            canvasCtx.lineTo(20, height - 20);
            canvasCtx.lineTo(20 + bracketSize, height - 20);
            canvasCtx.stroke();

            // Bottom-right
            canvasCtx.beginPath();
            canvasCtx.moveTo(width - 20 - bracketSize, height - 20);
            canvasCtx.lineTo(width - 20, height - 20);
            canvasCtx.lineTo(width - 20, height - 20 - bracketSize);
            canvasCtx.stroke();

            // === PROGRESS BAR ===
            const barWidth = 200;
            const barHeight = 6;
            const barX = (width - barWidth) / 2;
            const barY = height - 40;

            // Background
            canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            canvasCtx.fillRect(barX, barY, barWidth, barHeight);

            // Progress fill
            const progressGradient = canvasCtx.createLinearGradient(barX, 0, barX + barWidth, 0);
            progressGradient.addColorStop(0, 'rgba(0, 255, 200, 1)');
            progressGradient.addColorStop(1, 'rgba(0, 200, 255, 1)');
            canvasCtx.fillStyle = progressGradient;
            canvasCtx.fillRect(barX, barY, barWidth * progress, barHeight);

            // Handle calibration during scan
            if (isCalibrating) {
                handleCalibrationFrame(landmarks);
            } else if (isRunning) {
                handleSessionFrame(landmarks);
            }
        }
        // === CLEAN VIEW (After scan animation) ===
        else if (isRunning) {
            const isLooking = !isLookingAway(landmarks);
            const indicatorColor = isLooking ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)';

            // Subtle face oval
            drawConnectors(canvasCtx, landmarks, FACEMESH_FACE_OVAL, {
                color: indicatorColor,
                lineWidth: 2
            });

            handleSessionFrame(landmarks);
        }
        // Calibration without scan (edge case)
        else if (isCalibrating) {
            handleCalibrationFrame(landmarks);
        }
    }

    canvasCtx.restore();

    // === TEXT OVERLAY (Drawn after restore to avoid mirror inversion) ===
    // Save again for text
    canvasCtx.save();
    // Flip horizontally to counter the CSS mirror
    canvasCtx.translate(width, 0);
    canvasCtx.scale(-1, 1);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        if (showScanAnimation && (isCalibrating || isRunning)) {
            const now2 = Date.now();
            const pulse2 = 0.7 + Math.sin((now2 % 800) / 800 * Math.PI * 2) * 0.3;

            // Status text with glow
            canvasCtx.shadowColor = 'rgba(0, 255, 255, 0.8)';
            canvasCtx.shadowBlur = 10;
            canvasCtx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
            canvasCtx.fillStyle = `rgba(0, 255, 255, ${pulse2})`;
            canvasCtx.fillText('◉ ANALYZING FACIAL FEATURES', 25, 35);

            // Metrics display
            canvasCtx.shadowBlur = 0;
            canvasCtx.font = '12px monospace';
            canvasCtx.fillStyle = 'rgba(200, 255, 255, 0.9)';
            canvasCtx.fillText('LANDMARKS: 468 POINTS', 25, 55);
            canvasCtx.fillText('TRACKING: ACTIVE', 25, 70);
        } else if (isRunning) {
            // Small status indicator
            const isLooking = !isLookingAwaySimple(results.multiFaceLandmarks[0]);
            canvasCtx.beginPath();
            canvasCtx.arc(width - 25, 25, 8, 0, Math.PI * 2);
            canvasCtx.fillStyle = isLooking ? '#4caf50' : '#f44336';
            canvasCtx.fill();
        }
    } else {
        // No face detected
        if (isCalibrating || isRunning) {
            canvasCtx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
            canvasCtx.fillStyle = 'rgba(255, 100, 100, 0.95)';
            canvasCtx.fillText('⚠ No face detected - Please look at camera', 25, 35);
        }
    }

    canvasCtx.restore();
}

// Helper for text overlay (avoids calling full isLookingAway which needs more state)
function isLookingAwaySimple(landmarks) {
    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const earL = landmarks[LANDMARKS.LEFT_EAR];
    const earR = landmarks[LANDMARKS.RIGHT_EAR];
    const earsMidpointX = (earL.x + earR.x) / 2;
    const yawDeviation = nose.x - earsMidpointX - baselineYaw;
    return Math.abs(yawDeviation) > YAW_THRESHOLD;
}

const faceMesh = new FaceMesh({
    locateFile: (file) => {
        // Pinned to stable version
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
    }
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
faceMesh.onResults(onResults);

// =============================================================================
// Calibration Logic
// =============================================================================
function handleCalibrationFrame(landmarks) {
    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const earL = landmarks[LANDMARKS.LEFT_EAR];
    const earR = landmarks[LANDMARKS.RIGHT_EAR];

    const earsMidpointX = (earL.x + earR.x) / 2;
    const yawDeviation = nose.x - earsMidpointX;

    calibrationFrames.push(yawDeviation);
}

function finishCalibration() {
    if (calibrationFrames.length > 0) {
        // Calculate average yaw as baseline
        baselineYaw = calibrationFrames.reduce((a, b) => a + b, 0) / calibrationFrames.length;
        console.log(`Calibration complete. Baseline yaw: ${baselineYaw.toFixed(4)}`);
        calibrationProgressDisplay.innerText = "Complete ✓";
        calibrationProgressDisplay.style.color = "#4caf50";
    }
    isCalibrating = false;

    // Now start actual session
    setTimeout(() => {
        calibrationStatusDiv.classList.add('hidden');
        startActualSession();
    }, 500);
}

// =============================================================================
// Session Frame Handling
// =============================================================================
function handleSessionFrame(landmarks) {
    const frameData = extractFeatures(landmarks);
    frameBuffer.push(frameData);

    // Real-time eye contact calculation (client-side preview)
    totalFrames++;
    const isLookingAtCamera = !isLookingAway(landmarks);
    if (isLookingAtCamera) {
        eyeContactFrames++;
    }

    // Update UI
    const eyeContactPct = Math.round((eyeContactFrames / totalFrames) * 100);
    eyeContactDisplay.innerText = `${eyeContactPct}%`;

    // Color coding
    if (eyeContactPct >= 70) {
        eyeContactDisplay.style.color = "#4caf50"; // Green
    } else if (eyeContactPct >= 50) {
        eyeContactDisplay.style.color = "#ff9800"; // Orange
    } else {
        eyeContactDisplay.style.color = "#f44336"; // Red
    }
}

function isLookingAway(landmarks) {
    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const earL = landmarks[LANDMARKS.LEFT_EAR];
    const earR = landmarks[LANDMARKS.RIGHT_EAR];

    const earsMidpointX = (earL.x + earR.x) / 2;
    const yawDeviation = nose.x - earsMidpointX;

    // Adjust for baseline (from calibration)
    const adjustedYaw = yawDeviation - baselineYaw;

    return Math.abs(adjustedYaw) > YAW_THRESHOLD;
}

function extractFeatures(landmarks) {
    return {
        timestamp: Date.now(),
        nose_tip: landmarks[LANDMARKS.NOSE_TIP],
        left_ear: landmarks[LANDMARKS.LEFT_EAR],
        right_ear: landmarks[LANDMARKS.RIGHT_EAR],
        mouth_left: landmarks[LANDMARKS.MOUTH_LEFT],
        mouth_right: landmarks[LANDMARKS.MOUTH_RIGHT],
        chin: landmarks[LANDMARKS.CHIN],
        forehead: landmarks[LANDMARKS.FOREHEAD]
    };
}

// =============================================================================
// Timer & Batch Sending
// =============================================================================
function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${minutes}:${seconds}`;
}

async function sendBatch() {
    // First, try to flush any pending queue
    await flushPendingQueue();

    if (frameBuffer.length === 0) return;

    const payload = [...frameBuffer];
    frameBuffer = [];

    try {
        const response = await fetch(`${SERVER_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frames: payload })
        });

        if (response.ok) {
            packetCounter++;
            packetDisplay.innerText = packetCounter;
            statusDisplay.innerText = "Receiving Data...";
            statusDisplay.style.color = "#4caf50";
        } else {
            throw new Error(`Server responded with ${response.status}`);
        }
    } catch (error) {
        console.error("Error sending batch, queuing for retry:", error);
        statusDisplay.innerText = "Connection Issue (Queuing)";
        statusDisplay.style.color = "#ff9800";

        // Add to pending queue
        pendingQueue.push({ frames: payload, timestamp: Date.now() });
        savePendingQueue();
    }
}

async function flushPendingQueue() {
    if (pendingQueue.length === 0) return;

    const toRetry = [...pendingQueue];
    pendingQueue = [];

    for (const batch of toRetry) {
        try {
            const response = await fetch(`${SERVER_URL}/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch)
            });

            if (!response.ok) {
                throw new Error("Retry failed");
            }
            console.log("Flushed queued batch successfully");
        } catch (e) {
            // Put back in queue
            pendingQueue.push(batch);
        }
    }
    savePendingQueue();
}

async function endSession() {
    try {
        statusDisplay.innerText = "Generating Report...";
        statusDisplay.style.color = "#2196f3";

        // Final flush
        await flushPendingQueue();

        const response = await fetch(`${SERVER_URL}/end_session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: Date.now() })
        });

        const data = await response.json();
        console.log("Session Report:", data);

        if (data.report) {
            alert("Session Report:\n\n" + data.report);
        }

        statusDisplay.innerText = "Session Completed";
        statusDisplay.style.color = "#888";
        clearPendingQueue();

    } catch (error) {
        console.error("Error ending session:", error);
        statusDisplay.innerText = "Report Generation Failed";
        statusDisplay.style.color = "#f44336";
    }
}

// =============================================================================
// Session Control
// =============================================================================
function startActualSession() {
    isRunning = true;
    startTime = Date.now();
    statusDisplay.innerText = "Session Active";
    statusDisplay.style.color = "#4caf50";

    // Start Intervals
    timerInterval = setInterval(updateTimer, 1000);
    sendingInterval = setInterval(sendBatch, BATCH_INTERVAL_MS);
}

startBtn.addEventListener('click', () => {
    // UI Updates
    startBtn.disabled = true;
    stopBtn.disabled = false;
    packetCounter = 0;
    eyeContactFrames = 0;
    totalFrames = 0;
    packetDisplay.innerText = "0";
    eyeContactDisplay.innerText = "--%";
    statusDisplay.innerText = "Initializing Camera...";

    // Load any pending queue from previous session
    loadPendingQueue();

    // Start Camera
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await faceMesh.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });
    camera.start();

    // Wait for face detection before starting calibration
    isWaitingForFace = true;
    calibrationStatusDiv.classList.remove('hidden');
    calibrationProgressDisplay.innerText = "Detecting face...";
    calibrationProgressDisplay.style.color = "#2196f3";
    statusDisplay.innerText = "Waiting for face...";
    statusDisplay.style.color = "#2196f3";
});

// Called when face is first detected
function startCalibration() {
    isCalibrating = true;
    calibrationFrames = [];
    calibrationProgressDisplay.innerText = "Look at camera...";
    calibrationProgressDisplay.style.color = "#ff9800";
    statusDisplay.innerText = "Calibrating...";
    statusDisplay.style.color = "#ff9800";

    // Start the 5-second scan animation during calibration
    scanAnimationEndTime = Date.now() + SCAN_ANIMATION_DURATION_MS;

    setTimeout(finishCalibration, CALIBRATION_DURATION_MS);
}

stopBtn.addEventListener('click', async () => {
    // Stop Logic
    isRunning = false;
    isCalibrating = false;
    if (camera) camera.stop();
    if (timerInterval) clearInterval(timerInterval);
    if (sendingInterval) clearInterval(sendingInterval);

    // UI Updates
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Flush remaining buffer
    await sendBatch();

    // Trigger End Session
    await endSession();
});
