import logging
import json
import uuid
import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from livekit.agents import JobContext, WorkerOptions, cli, RoomOutputOptions
from livekit.agents.llm import function_tool
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins.turn_detector.english import EnglishModel
from livekit.plugins import silero, deepgram, groq
import asyncio
from youtube_transcript_api import YouTubeTranscriptApi
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

logger = logging.getLogger("interview_agent")
logger.setLevel(logging.INFO)

# Hardcoded API keys
GROQ_API_KEY = ""
DEEPGRAM_API_KEY = ""

# Initialize Groq client
groq_client = Groq(api_key=GROQ_API_KEY)

@dataclass
class InterviewQuestion:
    """Class to represent an interview question."""
    id: str
    question: str
    context: str
    difficulty: str = "medium"

@dataclass
class UserData:
    """Class to store user data during a session."""
    ctx: Optional[JobContext] = None
    current_questions: List[InterviewQuestion] = field(default_factory=list)
    video_summary: Optional[str] = None
    current_question_index: int = 0
    video_topic: str = "general"

    def reset(self) -> None:
        """Reset session data."""
        self.current_questions = []
        self.video_summary = None
        self.current_question_index = 0
        self.video_topic = "general"

    def add_questions(self, questions: List[str], context: str, topic: str) -> None:
        """Add interview questions to the session."""
        self.current_questions = []
        for i, q in enumerate(questions):
            self.current_questions.append(InterviewQuestion(
                id=str(uuid.uuid4()),
                question=q,
                context=context,
                difficulty="medium" if i == 0 else "hard" if i == len(questions) - 1 else "medium"
            ))
        self.video_topic = topic

    def get_current_question(self) -> Optional[InterviewQuestion]:
        """Get the current question."""
        if 0 <= self.current_question_index < len(self.current_questions):
            return self.current_questions[self.current_question_index]
        return None

    def next_question(self) -> Optional[InterviewQuestion]:
        """Move to the next question."""
        self.current_question_index += 1
        return self.get_current_question()

def extract_youtube_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various YouTube URL formats."""
    patterns = [
        r'(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
        r'^([a-zA-Z0-9_-]{11})$'  # Direct video ID
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None

def get_youtube_transcript(video_id: str) -> Optional[str]:
    """Get transcript from YouTube video."""
    try:
        logger.info(f"Attempting to fetch transcript for video: {video_id}")
        
        # Try direct transcript fetch first (most common case)
        try:
            transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
            logger.info(f"Successfully fetched English transcript with {len(transcript_data)} entries")
        except Exception as e:
            logger.info(f"English transcript not available, trying other languages: {str(e)}")
            
            # Try to get any available transcript
            try:
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                logger.info(f"Available transcripts: {[(t.language_code, t.is_generated) for t in transcript_list]}")
                
                # Try to find any transcript (preferring non-generated)
                transcript = None
                for t in transcript_list:
                    if not t.is_generated:  # Prefer manual transcripts
                        transcript = t
                        break
                
                if not transcript:
                    # Fall back to generated transcripts
                    for t in transcript_list:
                        transcript = t
                        break
                
                if not transcript:
                    logger.error("No transcripts available")
                    return None
                
                logger.info(f"Using transcript in language: {transcript.language_code}")
                transcript_data = transcript.fetch()
                
            except Exception as inner_e:
                logger.error(f"Failed to fetch any transcript: {str(inner_e)}")
                return None
        
        # Convert transcript data to text
        # Handle both dictionary and object formats
        transcript_text_parts = []
        for entry in transcript_data:
            try:
                if hasattr(entry, 'text'):
                    # Object format
                    transcript_text_parts.append(entry.text)
                elif isinstance(entry, dict) and 'text' in entry:
                    # Dictionary format
                    transcript_text_parts.append(entry['text'])
                else:
                    # Try to convert to string as fallback
                    transcript_text_parts.append(str(entry))
            except Exception as entry_error:
                logger.warning(f"Error processing transcript entry: {entry_error}")
                continue
        
        if not transcript_text_parts:
            logger.error("No text content found in transcript")
            return None
        
        transcript_text = " ".join(transcript_text_parts)
        logger.info(f"Successfully processed transcript with {len(transcript_text)} characters")
        
        return transcript_text
        
    except Exception as e:
        logger.error(f"Error fetching transcript for video {video_id}: {str(e)}")
        return None

def generate_summary_and_questions(transcript_text: str) -> tuple[str, List[str], str]:
    """Generate summary and interview questions from transcript using Groq."""
    try:
        # Generate summary
        summary_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a technical content analyzer. Create a concise summary highlighting key concepts, technical details, and main learning points that would be relevant for interview preparation."
                },
                {
                    "role": "user",
                    "content": f"Analyze this transcript and create a comprehensive summary focusing on technical concepts and key learning points:\n\n{transcript_text[:8000]}"
                }
            ],
            model="llama-3.3-70b-versatile",
            max_tokens=600,
            temperature=0.3
        )
        
        summary = summary_completion.choices[0].message.content
        
        # Determine topic
        topic_keywords = {
            "Machine Learning": ["machine learning", "ml", "neural network", "model", "training", "dataset", "algorithm"],
            "Software Engineering": ["software", "engineering", "architecture", "design pattern", "framework", "api"],
            "Data Structures": ["array", "tree", "graph", "hash", "stack", "queue", "linked list"],
            "Algorithms": ["algorithm", "sorting", "searching", "complexity", "big o", "optimization"],
            "Web Development": ["web", "frontend", "backend", "javascript", "react", "node", "database"],
            "System Design": ["system design", "scalability", "distributed", "microservices", "load balancer"],
            "Programming": ["programming", "coding", "function", "variable", "loop", "conditional"]
        }
        
        detected_topic = "General Technology"
        content_lower = (transcript_text + " " + summary).lower()
        
        for topic, keywords in topic_keywords.items():
            if any(keyword in content_lower for keyword in keywords):
                detected_topic = topic
                break
        
        # Generate questions
        questions_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": f"You are an expert technical interviewer specializing in {detected_topic} or user specified topic. Generate 3 progressive interview questions (easy to hard) based on the content summary. Questions should test understanding, application, and problem-solving skills."
                },
                {
                    "role": "user",
                    "content": f"Based on this technical content summary, generate exactly 3 interview questions that progressively increase in difficulty:\n\nSummary: {summary}\n\nFormat: Return only the questions, one per line, numbered 1-3."
                }
            ],
            model="llama-3.3-70b-versatile",
            max_tokens=400,
            temperature=0.5
        )
        
        questions_text = questions_completion.choices[0].message.content
        
        # Parse questions
        questions = []
        for line in questions_text.split('\n'):
            line = line.strip()
            if line and ('?' in line or len(line) > 20):
                # Remove numbering if present
                question = re.sub(r'^\d+\.?\s*', '', line).strip()
                if question:
                    questions.append(question)
        
        # Ensure we have at least 3 questions
        if len(questions) < 3:
            default_questions = [
                f"Can you explain the main concepts discussed in this {detected_topic} content?",
                f"How would you apply the principles covered in this video to a real-world {detected_topic} scenario?",
                f"What are the potential challenges or limitations of the approaches discussed in this content?"
            ]
            questions.extend(default_questions[len(questions):3])
        
        return summary, questions[:3], detected_topic
        
    except Exception as e:
        logger.error(f"Error generating summary and questions: {str(e)}")
        return "Failed to generate summary.", ["Can you explain what you learned from the video?"], "General"

class InterviewAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""
            You are a professional technical interview coach. Your role is to:
            
            1. Help users prepare for technical interviews using YouTube video content or there specified topic 
            2. Ask progressive questions based on video transcripts (easy to hard)
            3. Provide constructive feedback on answers
            4. Use the Socratic method to guide learning
            5. Keep responses concise and focused
            
            PROCESS:
            - Start by asking for a YouTube URL or user specified topic.
            - Process the video transcript and generate relevant questions
            - Ask questions one by one, providing feedback
            - Encourage critical thinking and detailed explanations
            
            TONE: Professional, encouraging, and supportive. Help build confidence while maintaining interview-like rigor.
            
            RESPONSE LENGTH: Keep responses to 1-2 sentences to allow the user to do most of the talking.
            """,
            stt=deepgram.STT(api_key=DEEPGRAM_API_KEY),
            llm=groq.LLM(model="gemma2-9b-it", api_key=GROQ_API_KEY),
            tts=deepgram.TTS(model="aura-2-athena-en", api_key=DEEPGRAM_API_KEY),
            vad=silero.VAD.load(),
        )

    @function_tool
    async def process_youtube_video(self, video_url: str) -> str:
        """Process a YouTube video and generate interview questions."""
        try:
            # Extract video ID
            video_id = extract_youtube_video_id(video_url)
            if not video_id:
                return "Invalid YouTube URL. Please provide a valid YouTube video URL."
            
            logger.info(f"Processing YouTube video ID: {video_id}")
            
            # Get transcript
            transcript = get_youtube_transcript(video_id)
            if not transcript:
                return "No transcript available for this video. Please choose a video with captions enabled."
            
            # Generate summary and questions
            summary, questions, topic = generate_summary_and_questions(transcript)
            
            # Store in session data (this will be handled by the session)
            logger.info(f"Generated {len(questions)} questions for topic: {topic}")
            
            return f"Great! I've analyzed the {topic} video and prepared {len(questions)} interview questions. Let's start with the first question: {questions[0]}"
            
        except Exception as e:
            logger.error(f"Error processing YouTube video: {str(e)}")
            return f"Error processing the video: {str(e)}. Please try another video."

    @function_tool
    async def evaluate_answer_and_next_question(self, user_answer: str, current_question: str, context: str) -> str:
        """Evaluate user's answer and provide the next question."""
        try:
            # Generate evaluation and next question
            evaluation_completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a technical interviewer. Provide brief, constructive feedback (1-2 sentences) on the user's answer, then ask a follow-up or next question based on the context."
                    },
                    {
                        "role": "user",
                        "content": f"Context: {context}\n\nQuestion asked: {current_question}\n\nUser's answer: {user_answer}\n\nProvide brief feedback and ask a relevant follow-up question."
                    }
                ],
                model="llama-3.3-70b-versatile",
                max_tokens=200,
                temperature=0.4
            )
            
            response = evaluation_completion.choices[0].message.content
            return response
            
        except Exception as e:
            logger.error(f"Error evaluating answer: {str(e)}")
            return "Thank you for your answer. Can you elaborate on any specific technical details?"

    async def on_enter(self):
        """Called when the agent session starts."""
        await asyncio.sleep(1)
        await self.session.say("Hello! I'm your technical interview coach. Please provide a YouTube URL of a technical video, and I'll generate interview questions based on its content.")

async def entrypoint(ctx: JobContext):
    """Main entry point for the agent."""
    logger.info("Starting interview agent")
    
    try:
        await ctx.connect()
        logger.info("Connected to LiveKit")
    except Exception as e:
        logger.error(f"Failed to connect: {str(e)}")
        raise

    # Initialize user data
    userdata = UserData(ctx=ctx)
    
    # Create agent
    agent = InterviewAgent()
    
    # Create session
    session = AgentSession(
        turn_detection=EnglishModel()
    )
    
    # Text message handler
    async def handle_text_message(rpc_data):
        """Handle text messages from the client."""
        try:
            payload_data = json.loads(rpc_data.payload)
            message = payload_data.get("message", "").strip()
            
            if not message:
                return "error: No message provided"
            
            logger.info(f"Processing text message: {message}")
            
            # Check if it's a YouTube URL
            if extract_youtube_video_id(message):
                # Process the video
                video_id = extract_youtube_video_id(message)
                transcript = get_youtube_transcript(video_id)
                
                if not transcript:
                    response = "No transcript available for this video. Please choose a video with captions enabled."
                else:
                    summary, questions, topic = generate_summary_and_questions(transcript)
                    userdata.video_summary = summary
                    userdata.add_questions(questions, summary, topic)
                    response = f"Great! I've analyzed this {topic} video. Let's start with the first question: {questions[0]}"
                
                await session.say(response)
                return "success"
            
            # If we have questions loaded, treat as answer
            elif userdata.current_questions and userdata.video_summary:
                current_q = userdata.get_current_question()
                if current_q:
                    # Evaluate answer
                    try:
                        evaluation_completion = groq_client.chat.completions.create(
                            messages=[
                                {
                                    "role": "system",
                                    "content": "You are a technical interviewer. Provide brief, constructive feedback (1-2 sentences) on the user's answer, then either ask a follow-up question or move to the next prepared question."
                                },
                                {
                                    "role": "user",
                                    "content": f"Video Context: {userdata.video_summary[:1000]}\n\nQuestion: {current_q.question}\n\nUser's Answer: {message}\n\nProvide feedback and next question."
                                }
                            ],
                            model="llama-3.3-70b-versatile",
                            max_tokens=300,
                            temperature=0.4
                        )
                        
                        feedback = evaluation_completion.choices[0].message.content
                        
                        # Check if we should move to next question
                        next_q = userdata.next_question()
                        if next_q:
                            response = f"{feedback}\n\nNext question: {next_q.question}"
                        else:
                            response = f"{feedback}\n\nGreat job! We've completed all the questions. Would you like to try another video?"
                            userdata.reset()
                        
                    except Exception as e:
                        logger.error(f"Error generating feedback: {e}")
                        response = "Thank you for your answer. Can you provide more technical details about your approach?"
                    
                    await session.say(response)
                    return "success"
            
            else:
                response = "Please provide a YouTube URL to start the interview practice session."
                await session.say(response)
                return "success"
                
        except Exception as e:
            logger.error(f"Error handling text message: {e}")
            return f"error: {str(e)}"
    
    # Register RPC handler
    ctx.room.local_participant.register_rpc_method(
        "agent.textMessage",
        handle_text_message
    )
    
    # Start the session
    try:
        await session.start(
            room=ctx.room,
            room_output_options=RoomOutputOptions(audio_enabled=True),
            agent=agent
        )
        logger.info("Agent session started successfully")
    except Exception as e:
        logger.error(f"Failed to start session: {str(e)}")
        raise

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))