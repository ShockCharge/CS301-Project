import boto3

sns_client = boto3.client('sns', region_name='ap-southeast-2')

response = sns_client.create_topic(Name='Reminder Notification')
topic_arn = response['TopicArn']
print(f"Created Topic Arn: {topic_arn}")

subscription = sns_client.subscribe(
    TopicArn=topic_arn,
    Protocol='email',
    Endpoints='grizzlybearr89@gmail.com'
)
print(f"Subcription ARN : {subscription['SubscriptionArn']}")

response = sns_client.publish(
    TopicArn=topic_arn,
    Message='This is a reminder for your next task',
    Subject='SNS Notification'
)
print(f"Message ID: {response['MessageID']}")
