import boto3
import os

class SNSService:
    def __init__(self):
        self.client = boto3.client( 
            'sns',
            region_name='ap-southeast-2'
        )
        self.topic_arn = os.getenv("SNS_TOPIC_ARN")

    def create_topic(self, name="Reminder Notification"):
        response = self.client.create_topic(Name=name)
        self.topic_arn = response['TopicArn']
        return self.topic_arn

    def subscribe_email(self, email='grizzlybearr89@gmail.com'):
        response = self.client.subscribe(
            TopicArn=self.topic_arn,
            Protocol='email',
            Endpoint=email
        )
        return response

    def send_notification(self, message = "This is a reminder for your next task", subject="SNS Notification"):
        response = self.client.publish(
            TopicArn=self.topic_arn,
            Message=message,
            Subject=subject
        )
        return response