from celery import Celery

celery_app= Celery(
    'study_planner',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

