import os
import warnings
import langchain  
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pymongo import MongoClient
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.globals import set_verbose

langchain.verbose = False 
set_verbose(False)

warnings.filterwarnings("ignore", category=UserWarning, module="langchain_core._api.deprecation")
load_dotenv()

# Timezone configuration with fallback
try:
    NZ_TZ = ZoneInfo("Pacific/Auckland")
except ZoneInfoNotFoundError:
    print("Warning: 'Pacific/Auckland' timezone not found. Falling back to UTC.")
    print("Please install tzdata: pip install tzdata")
    NZ_TZ = ZoneInfo("UTC")

# MongoDB connection
try:
    MONGO_USER = os.environ.get("MONGO_USER", "")
    MONGO_PASS = os.environ.get("MONGO_PASS", "")
    
    if MONGO_USER and MONGO_PASS:
        conn_str = f"mongodb+srv://{MONGO_USER}:{MONGO_PASS}@studyplanner.y4rlgjy.mongodb.net/study_planner_db?retryWrites=true&w=majority"
        mongo_client = MongoClient(conn_str, serverSelectionTimeoutMS=5000)
        mongo_client.server_info()
        db = mongo_client["study_planner_db"]
        users_collection = db["users"]
        schedules_collection = db["schedules"]
        tasks_collection = db["tasks"]
        exams_collection = db["exams"]
        classes_collection = db["classes"]
        vacations_collection = db["vacations"]
        social_connections_collection = db["social_connections"]
        study_groups_collection = db["study_groups"]
        group_members_collection = db["group_members"]
        group_messages_collection = db["group_messages"]
        
        print("MongoDB Atlas connected successfully!")
    else:
        print("No MongoDB credentials found. Running in development mode.")
        users_collection = None
        schedules_collection = None
        tasks_collection = None
        exams_collection = None
        classes_collection = None
        vacations_collection = None
        social_connections_collection = None
        study_groups_collection = None
        group_members_collection = None
        group_messages_collection = None
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    print("Running in development mode.")
    users_collection = None
    schedules_collection = None
    tasks_collection = None
    exams_collection = None
    classes_collection = None
    vacations_collection = None
    social_connections_collection = None
    study_groups_collection = None
    group_members_collection = None
    group_messages_collection = None

# LLM Configuration
llm = ChatOllama(
    model="qwen2.5:3b",
    temperature=0.3,
    base_url="http://localhost:11434",
 )

prompt = ChatPromptTemplate.from_messages([
    ("system", """
You are a helpful, encouraging university study coach in Auckland, NZ.
Use NZ English. Be concise, practical, positive and motivating.
Base your answers on the user's actual tasks, exams, classes and schedules below.

Current user data:
{user_context}

If you don't know something, say so — don't guess.
    """),
    ("human", "{question}")
])

chain = prompt | llm | StrOutputParser()


def get_ai_suggestion_sync(context):
    """
    Generate AI suggestions synchronously for the dashboard.
    
    Args:
        context (dict): Dictionary containing:
            - exams: List of exam dictionaries with 'name' and 'date'
            - tasks: List of task dictionaries with 'name' and 'priority'
    
    Returns:
        str: AI-generated suggestion/motivational message
    """
    try:
        exams = context.get('exams', [])
        tasks = context.get('tasks', [])
        
        # Check if there are any tasks or exams
        has_content = len(exams) > 0 or len(tasks) > 0
        
        if not has_content:
            # If no tasks or exams, show only motivational tips
            motivational_tips = [
                "Motivational Tip:Remember, every big project starts with small steps. Break your tasks into manageable parts to keep things from feeling overwhelming.",
                "Motivational Tip:You're doing great! Take a moment to celebrate what you've already accomplished today. Small wins add up to big success!",
                "Motivational Tip:Progress over perfection. Focus on making consistent effort rather than being perfect. You've got this! 🌟",
                "Motivational Tip:Your future self will thank you for the effort you put in today. Keep pushing forward!",
                "Motivational Tip:Remember: Rest is part of productivity. Take care of yourself while pursuing your goals.",
            ]
            import random
            return random.choice(motivational_tips)
        
        # Format exams for the AI prompt
        exams_text = "\n".join([
            f"- {exam.get('name', 'Unknown')}: {exam.get('date', 'N/A')}"
            for exam in exams
        ]) or "No upcoming exams"
        
        # Format tasks for the AI prompt - prioritize HIGH priority tasks
        tasks_text = "\n".join([
            f"- {task.get('name', 'Unknown')} (Priority: {task.get('priority', 'medium')})"
            for task in tasks
        ]) or "No pending tasks"
        
        user_context = f"""
Upcoming Exams:
{exams_text}

Pending Tasks (sorted by priority):
{tasks_text}
        """
        
        # Generate suggestion using the chain
        suggestion = chain.invoke({
            "question": "Give me one motivational study tip and one actionable suggestion for today based on the user's tasks and exams. Focus on HIGH priority tasks first. Keep it concise (2-3 sentences max) and encouraging.",
            "user_context": user_context
        })
        
        return suggestion.strip()
    
    except Exception as e:
        print(f"Error generating AI suggestion: {e}")
        # Fallback messages if AI fails
        fallback_messages = [
            "Motivational Tip:You've got this! Focus on one task at a time and celebrate small wins. 💪",
            "Motivational Tip:Keep pushing forward! Every task completed brings you closer to your goals. 🚀",
            "Motivational Tip:Remember: Progress over perfection. You're doing great! 🌟",
            "Motivational Tip:Break down your goals into smaller tasks. You can do it! 📚"
        ]
        import random
        return random.choice(fallback_messages)
