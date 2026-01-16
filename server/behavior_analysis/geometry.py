import math

def calculate_distance(p1, p2):
    """Euclidean distance between two points (2D)."""
    return math.sqrt((p1['x'] - p2['x'])**2 + (p1['y'] - p2['y'])**2)

def analyze_frame(landmarks):
    """
    Analyzes a single frame of landmarks to determine behavioral state.
    
    Args:
        landmarks (dict): Dictionary of keypoints (nose_tip, left_ear, etc.)
                          Each point is {'x': float, 'y': float, 'z': float}
    
    Returns:
        dict: {
            'is_looking_away': bool,
            'is_smiling': bool,
            'is_tilted': bool,
            'details': dict
        }
    """
    # 1. Extract Points
    nose = landmarks['nose_tip']
    ear_l = landmarks['left_ear']
    ear_r = landmarks['right_ear']
    mouth_l = landmarks['mouth_left']
    mouth_r = landmarks['mouth_right']

    # 2. Compute Head Yaw (Looking Left/Right)
    # Logic: In a frontal face, Key nose tip X should be the midpoint of Ear L and Ear R X.
    ears_midpoint_x = (ear_l['x'] + ear_r['x']) / 2
    
    # Deviation from center. 
    # Note: X is 0.0 (Left) to 1.0 (Right).
    # If nose is 0.5 and ears_mid is 0.5, deviation is 0.
    yaw_deviation = nose['x'] - ears_midpoint_x
    
    # Threshold: If nose moves more than 0.1 units (10% of screen width approx) away from center of ears
    # This is a robust heuristic for "Looking away"
    YAW_THRESHOLD = 0.08 
    is_looking_away = abs(yaw_deviation) > YAW_THRESHOLD

    # 3. Compute Head Tilt (Roll)
    # Logic: Difference in Y height between ears.
    # Y is 0.0 (Top) to 1.0 (Bottom).
    tilt_deviation = ear_l['y'] - ear_r['y']
    TILT_THRESHOLD = 0.05
    is_tilted = abs(tilt_deviation) > TILT_THRESHOLD

    # 4. Compute Smile
    # Logic: Ratio of mouth width to face width (distance between ears)
    mouth_width = calculate_distance(mouth_l, mouth_r)
    face_width = calculate_distance(ear_l, ear_r)
    
    if face_width == 0:
        smile_ratio = 0
    else:
        smile_ratio = mouth_width / face_width
        
    # Threshold needs tuning. 
    # Neutral is usually around 0.35 - 0.40. Smiling is usually > 0.45 
    SMILE_THRESHOLD = 0.48
    is_smiling = smile_ratio > SMILE_THRESHOLD

    return {
        'is_looking_away': is_looking_away,
        'is_smiling': is_smiling,
        'is_tilted': is_tilted,
        'details': {
            'yaw_val': round(yaw_deviation, 3),
            'smile_ratio': round(smile_ratio, 3),
            'tilt_val': round(tilt_deviation, 3)
        }
    }
