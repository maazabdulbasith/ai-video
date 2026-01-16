from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from .geometry import analyze_frame
from .aggregator import SessionAggregator
from .llm_handler import generate_narrative

# Global session store for Demo (Not production safe!)
# In production, use Redis or Database with Session ID
current_session = SessionAggregator()

@csrf_exempt
def receive_data(request):
    """
    POST /api/data
    Receives batch of frames from client.
    """
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            raw_frames = data.get('frames', [])
            
            analyzed_frames = []
            for frame in raw_frames:
                # Run Geometry
                analysis = analyze_frame(frame)
                
                # Verify Keys exist in frame before merging? 
                # geometry returns {is_looking_away, ...}
                # we combine it with timestamp
                
                full_record = {
                    'timestamp': frame['timestamp'],
                    **analysis
                }
                analyzed_frames.append(full_record)
            
            # Add to Aggregator
            current_session.add_frames(analyzed_frames)
            
            return JsonResponse({'status': 'ok', 'processed': len(analyzed_frames)})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
    return JsonResponse({'status': 'invalid method'}, status=405)

@csrf_exempt
def end_session(request):
    """
    POST /api/end_session
    Triggers LLM analysis.
    """
    global current_session
    if request.method == 'POST':
        # Generate Timeline
        timeline = current_session.generate_timeline()
        
        # Generate Narrative
        report = generate_narrative(timeline)
        
        # Reset Session
        current_session = SessionAggregator()
        
        return JsonResponse({
            'status': 'finished',
            'timeline': timeline,
            'report': report
        })
    return JsonResponse({'status': 'invalid method'}, status=405)
