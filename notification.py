from aws_sns import SNSService

sns = SNSService()

def send_task_reminder(email, task_name):
    message = f"Reminder: You have an upcoming task: {task_name}"
    
    sns.subscribe_email(email)  # Only needed once ideally
    
    sns.send_notification(
        message=message,
        subject="Task Reminder"
    )