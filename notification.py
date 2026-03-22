import boto3

sns = boto3.client(
    "sns",
    region_name="ap-southeast-2"
)

def send_sms(phone, message):
    try:
        sns.publish(
            PhoneNumber=phone,
            Message=message
        )
        print("SMS sent successfully")
    except Exception as e:
        print("SMS error:", e)