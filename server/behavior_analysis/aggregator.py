class SessionAggregator:
    def __init__(self):
        self.frames = []
        self.window_size_sec = 5.0
        
    def add_frames(self, frames):
        """
        Add analyzed frames to the session.
        Each frame must have 'timestamp' (ms) and analytical flags.
        """
        self.frames.extend(frames)
        
    def generate_timeline(self):
        """
        Groups frames into 5-second windows and generates a summary for each.
        """
        if not self.frames:
            return []
            
        # Sort by timestamp
        self.frames.sort(key=lambda x: x['timestamp'])
        
        start_time = self.frames[0]['timestamp']
        windows = []
        
        current_window_idx = 0
        window_frames = []
        
        for frame in self.frames:
            # Determine which window this frame belongs to (0-5s, 5-10s, etc.)
            elapsed_sec = (frame['timestamp'] - start_time) / 1000.0
            window_idx = int(elapsed_sec // self.window_size_sec)
            
            if window_idx > current_window_idx:
                # Close previous window
                if window_frames:
                    windows.append(self._summarize_window(current_window_idx, window_frames))
                # Reset for next
                current_window_idx = window_idx
                window_frames = []
                
            window_frames.append(frame)
            
        # Add the last window
        if window_frames:
            windows.append(self._summarize_window(current_window_idx, window_frames))
            
        return windows

    def _summarize_window(self, index, frames):
        count = len(frames)
        if count == 0:
            return None
            
        # Count behaviors
        look_away_count = sum(1 for f in frames if f['is_looking_away'])
        smile_count = sum(1 for f in frames if f['is_smiling'])
        tilt_count = sum(1 for f in frames if f['is_tilted'])
        
        # Percentages
        pct_look_away = (look_away_count / count) * 100
        pct_smile = (smile_count / count) * 100
        
        # Dominant State Logic
        if pct_look_away > 60:
            state = "Looking Away / Distracted"
        elif pct_smile > 40:
            state = "Smiling / Enthusiastic"
        elif tilt_count > (count * 0.3):
             state = "Head Tilted / Contemplative"
        else:
            state = "Neutral / Focused"
            
        return {
            "time_range": f"{int(index * self.window_size_sec)}-{int((index + 1) * self.window_size_sec)}s",
            "state": state,
            "metrics": {
                "looking_away_pct": round(pct_look_away, 1),
                "smiling_pct": round(pct_smile, 1)
            }
        }
