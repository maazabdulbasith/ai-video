import json

def generate_narrative(timeline):
    """
    Simulates calling an LLM to interpret the behavioral timeline.
    In a real app, this would make an OpenAI/Gemini API call.
    """
    
    # 1. Construct Prompt
    prompt_context = "You are a communication coach analyzing a video session. Here is the behavior timeline:"
    prompt_data = json.dumps(timeline, indent=2)
    prompt_task = "Provide a brief narrative interpretation of the user's engagement and behavior over time. Focus on the progression."
    
    full_prompt = f"{prompt_context}\n{prompt_data}\n{prompt_task}"
    
    # print(f"DEBUG: Mock LLM Prompt:\n{full_prompt}")

    # 2. Mock Logic for Demo (Since we might not have an API key)
    # We'll construct a synthetic response based on the simple stats
    
    narrative_parts = []
    
    # Intro
    narrative_parts.append("Analysis of your session:\n")
    
    # Analysis per window type found
    states = [w['state'] for w in timeline]
    
    if not states:
        return "No data collected."

    # Pattern Matching (Simple rule-based 'LLM' for demo)
    if "Smiling / Enthusiastic" in states[0]:
        narrative_parts.append("You started the session with high energy and enthusiasm.")
    elif "Looking Away / Distracted" in states[0]:
        narrative_parts.append("At the beginning, you seemed a bit distracted or were checking your surroundings.")
    else:
        narrative_parts.append("You started with a calm, neutral focus.")
        
    # Middle/End analysis
    distracted_count = sum(1 for s in states if "Looking Away" in s)
    smile_count = sum(1 for s in states if "Smiling" in s)
    
    if distracted_count > len(states) / 2:
        narrative_parts.append("\nHowever, throughout most of the session, you frequently looked away from the camera. This might signal disinterest or multitasking.")
    elif smile_count > len(states) / 2:
        narrative_parts.append("\nYou maintained a very positive and warm presence throughout, smiling frequently.")
    else:
        narrative_parts.append("\nYou maintained steady focus for the majority of the time.")
        
    narrative_parts.append("\nRecommendation: Try to maintain consistent eye contact for better engagement.")

    return "".join(narrative_parts)
