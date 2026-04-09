from aws_sns import SNSService

sns_service = SNSService()

def send_task_reminder(email, task_name):
    message = f"Reminder: You have an upcoming task: {task_name}"

    # Subscribe user (only needed once ideally)
    sns_service.subscribe_email(email)

    # Send notification
    sns_service.send_notification(
        message=message,
        subject="Task Reminder"
    )