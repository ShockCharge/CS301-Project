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
        
        print("MongoDB Atlas connected successfully!")
    else:
        print("No MongoDB credentials found. Running in development mode.")
        users_collection = None
        schedules_collection = None
        tasks_collection = None
        exams_collection = None
        classes_collection = None
        vacations_collection = None
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    print("Running in development mode.")
    users_collection = None
    schedules_collection = None
    tasks_collection = None
    exams_collection = None
    classes_collection = None
    vacations_collection = None

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
