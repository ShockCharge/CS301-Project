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
from datetime import datetime

langchain.verbose = False 
set_verbose(False)

warnings.filterwarnings("ignore", category=UserWarning, module="langchain_core._api.deprecation")
load_dotenv()

# ====================== TIMEZONE ======================
try:
    NZ_TZ = ZoneInfo("Pacific/Auckland")
except ZoneInfoNotFoundError:
    print("Warning: 'Pacific/Auckland' timezone not found. Falling back to UTC.")
    NZ_TZ = ZoneInfo("UTC")


# ====================== MONGODB ======================
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
        users_collection = exams_collection = tasks_collection = schedules_collection = \
            classes_collection = vacations_collection = None
        social_connections_collection = study_groups_collection = \
            group_members_collection = group_messages_collection = None

except Exception as e:
    print(f"MongoDB connection failed: {e}")
    users_collection = exams_collection = tasks_collection = schedules_collection = \
        classes_collection = vacations_collection = None
    social_connections_collection = study_groups_collection = \
        group_members_collection = group_messages_collection = None


# ====================== LLM CHAIN ======================
llm = ChatOllama(
    model="qwen2.5:3b",      # You can change to llama3.2 or whatever you prefer
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


# ====================== UTILITY FUNCTIONS ======================
def get_task_status(date_str):
    """Used by both Flask and Celery"""
    if not date_str:
        return 'current'
    
    try:
        task_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        today = datetime.now(NZ_TZ).date()
        return 'outdated' if task_date < today else 'current'
    except (ValueError, TypeError):
        return 'current'


def get_ai_suggestion_sync(context):
    """
    Generate AI suggestions synchronously for the dashboard.
    """
    try:
        exams = context.get('exams', [])
        tasks = context.get('tasks', [])
        
        has_content = len(exams) > 0 or len(tasks) > 0
        
        if not has_content:
            motivational_tips = [
                "Motivational Tip: Remember, every big project starts with small steps...",
                "Motivational Tip: You're doing great! Take a moment to celebrate what you've already accomplished today...",
                "Motivational Tip: Progress over perfection. Focus on making consistent effort...",
            ]
            import random
            return random.choice(motivational_tips)
        
        exams_text = "\n".join([f"- {exam.get('name', 'Unknown')}: {exam.get('date', 'N/A')}" for exam in exams]) or "No upcoming exams"
        tasks_text = "\n".join([f"- {task.get('name', 'Unknown')} (Priority: {task.get('priority', 'medium')})" for task in tasks]) or "No pending tasks"
        
        user_context = f"""
Upcoming Exams:
{exams_text}

Pending Tasks:
{tasks_text}
        """
        
        suggestion = chain.invoke({
            "question": "Give me one motivational study tip and one actionable suggestion for today based on the user's tasks and exams. Focus on HIGH priority tasks first. Keep it concise (2-3 sentences max) and encouraging.",
            "user_context": user_context
        })
        
        return suggestion.strip()
    
    except Exception as e:
        print(f"Error generating AI suggestion: {e}")
        import random
        fallback = [
            "You've got this! Focus on one task at a time and celebrate small wins. 💪",
            "Keep pushing forward! Every task completed brings you closer to your goals. 🚀"
        ]
        return random.choice(fallback)