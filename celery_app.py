"""Compatibility module for starting Celery workers.

Run workers with either:
    celery -A task.celery_app worker --loglevel=info
or:
    celery -A celery_app.celery_app worker --loglevel=info
"""

from task import celery_app
from celery import Celery

celery_app= Celery(
    'study_planner',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

