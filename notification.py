import re
from typing import Optional

from aws_sns import SNSService, aws_error_message

sns_service = SNSService()


def normalize_phone_number(phone_number: str, default_country_code: str = "+64") -> str:
    """Normalize a phone number into a basic E.164-style value.

    The app stores phone numbers as user input. AWS SNS direct SMS expects an
    international number such as +64211234567. This helper keeps numbers that
    already start with + and converts local New Zealand-style numbers such as
    0211234567 into +64211234567.
    """
    if not phone_number:
        return ""

    cleaned = re.sub(r"[^\d+]", "", str(phone_number).strip())

    if cleaned.startswith("+"):
        return "+" + re.sub(r"\D", "", cleaned[1:])

    digits = re.sub(r"\D", "", cleaned)
    if not digits:
        return ""

    if digits.startswith("00"):
        return "+" + digits[2:]

    if digits.startswith("0"):
        return default_country_code + digits[1:]

    if digits.startswith(default_country_code.replace("+", "")):
        return "+" + digits

    return "+" + digits


def send_sms(phone_number: str, message: str, sender_id: str = "StudyPlan") -> bool:
    """Send a direct SMS reminder through AWS SNS.

    Returns True when AWS accepts the publish request. Returns False and logs a
    safe error message when sending fails.
    """
    normalized_phone = normalize_phone_number(phone_number)

    if not normalized_phone:
        print("SMS skipped: no valid phone number was provided.")
        return False

    try:
        sns_service.send_sms(normalized_phone, message, sender_id=sender_id)
        print(f"SMS sent to {normalized_phone}")
        return True
    except Exception as error:
        print(f"SMS failed for {normalized_phone}: {aws_error_message(error)}")
        return False


def send_task_reminder(email: str, task_name: str, phone_number: Optional[str] = None) -> bool:
    """Send a task reminder using the available notification channels.

    If a phone number is provided, this function sends a direct SMS. If an email
    address is provided and an SNS topic is configured, it also publishes a topic
    notification for subscribed email endpoints.
    """
    message = f"Reminder: You have an upcoming task: {task_name}"
    sent_any = False

    if phone_number:
        sent_any = send_sms(phone_number, message) or sent_any

    if email:
        try:
            sns_service.subscribe_email(email)
            sns_service.send_notification(
                message=message,
                subject="Study Planner Task Reminder",
            )
            print(f"SNS topic reminder published for {email}")
            sent_any = True
        except Exception as error:
            print(f"SNS email reminder failed for {email}: {aws_error_message(error)}")

    return sent_any
