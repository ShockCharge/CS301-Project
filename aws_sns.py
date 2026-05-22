import os
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

load_dotenv()


class SNSService:
    """Small wrapper around AWS SNS for Study Planner notifications.

    The service supports two notification styles:
    1. Topic-based notifications for subscribed email endpoints.
    2. Direct SMS publishing to a phone number in E.164 format.
    """

    def __init__(self, region_name: Optional[str] = None, topic_arn: Optional[str] = None):
        self.region_name = region_name or os.getenv("AWS_DEFAULT_REGION") or "ap-southeast-2"
        self.topic_arn = topic_arn or os.getenv("SNS_TOPIC_ARN")
        self.client = boto3.client("sns", region_name=self.region_name)

    def create_topic(self, name: str = "StudyPlannerReminderNotification") -> str:
        """Create an SNS topic and return its ARN."""
        response = self.client.create_topic(Name=name)
        self.topic_arn = response["TopicArn"]
        return self.topic_arn

    def subscribe_email(self, email: str):
        """Subscribe an email address to the configured SNS topic.

        The recipient must confirm the AWS subscription email before topic
        messages can be received.
        """
        if not self.topic_arn:
            raise ValueError("SNS_TOPIC_ARN is not configured.")
        if not email:
            raise ValueError("Email address is required for SNS subscription.")

        return self.client.subscribe(
            TopicArn=self.topic_arn,
            Protocol="email",
            Endpoint=email,
        )

    def send_notification(self, message: str, subject: str = "Study Planner Reminder"):
        """Publish a message to the configured SNS topic."""
        if not self.topic_arn:
            raise ValueError("SNS_TOPIC_ARN is not configured.")
        if not message:
            raise ValueError("Notification message cannot be empty.")

        return self.client.publish(
            TopicArn=self.topic_arn,
            Message=message,
            Subject=subject,
        )

    def send_sms(self, phone_number: str, message: str, sender_id: str = "StudyPlan"):
        """Send a direct SMS message through AWS SNS.

        The phone number should be in E.164 format, for example +64211234567.
        AWS accounts that are still in the SNS SMS sandbox can only send to
        verified destination phone numbers.
        """
        if not phone_number:
            raise ValueError("Phone number is required for SMS sending.")
        if not message:
            raise ValueError("SMS message cannot be empty.")

        attributes = {
            "AWS.SNS.SMS.SMSType": {
                "DataType": "String",
                "StringValue": "Transactional",
            }
        }

        if sender_id:
            attributes["AWS.SNS.SMS.SenderID"] = {
                "DataType": "String",
                "StringValue": sender_id[:11],
            }

        return self.client.publish(
            PhoneNumber=phone_number,
            Message=message,
            MessageAttributes=attributes,
        )


def aws_error_message(error: Exception) -> str:
    """Return a readable AWS error message without exposing credentials."""
    if isinstance(error, ClientError):
        return error.response.get("Error", {}).get("Message", str(error))
    if isinstance(error, BotoCoreError):
        return str(error)
    return str(error)
