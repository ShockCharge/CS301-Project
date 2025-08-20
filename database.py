import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load the variables from the .env file
load_dotenv()

# Load credentials from environment variables
MONGO_USER = os.environ["MONGO_USER"]
MONGO_PASS = os.environ["MONGO_PASS"]

conn_str = f"mongodb+srv://{MONGO_USER}:{MONGO_PASS}@studyplanner.y4rlgjy.mongodb.net/mydatabase?retryWrites=true&w=majority"
client = MongoClient(conn_str)

db = client["mydatabase"]
collection = db["mycollection"]

for doc in collection.find():
    print(doc)