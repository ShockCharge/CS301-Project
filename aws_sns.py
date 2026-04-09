import boto3
import os
from dotenv import load_dotenv

load_dotenv()

class SNSService:
    def __init__(self):
        self.client = boto3.client(
            'sns',
            region_name=os.getenv("AWS_DEFAULT_REGION")
        )
        self.topic_arn = os.getenv("SNS_TOPIC_ARN")

    def create_topic(self, name="Reminder Notification"):
        response = self.client.create_topic(Name=name)
        self.topic_arn = response['TopicArn']
        print("Topic ARN:", self.topic_arn)
        return self.topic_arn

    def subscribe_email(self, email='grizzlybearr89@gmail.com'):
        return self.client.subscribe(
            TopicArn=self.topic_arn,
            Protocol='email',
            Endpoint=email
        )

    def send_notification(self, message = "This is a reminder for your next task", subject="Task Reminder"):
        return self.client.publish(
            TopicArn=self.topic_arn,
            Message=message,
            Subject=subject
        )