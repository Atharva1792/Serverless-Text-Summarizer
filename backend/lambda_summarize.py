import json
import os
import boto3
import botocore
from datetime import datetime, timezone, timedelta
import uuid

bedrock_client = boto3.client(
    'bedrock-runtime',
    region_name=os.environ.get("AWS_DEFAULT_REGION",None)
)
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get("HISTORY_TABLE", None))

MODEL_ID = "apac.amazon.nova-lite-v1:0"

SUMMARY_INSTRUCTIONS = {
    "short":    "Please provide a short summary (2-3 sentences) of the following text, capturing only the most essential point.",
    "medium":   "Please provide a summary of the following text in a clear paragraph covering the main ideas and key takeaways.",
    "detailed": "Please provide a detailed summary of the following text. Use bullet points to cover all major themes, supporting details, and conclusions.",
}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", None),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}

def lambda_handler(event, context):
    if os.environ.get("SERVICE_ENABLED",None) == "false":
        return {
            "statusCode": 403,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({
                "error": "Service temporarily paused"
            })
        }
    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        body = json.loads(event.get("body", "{}"))
        input_text = body.get("text", "").strip()
        length = body.get("length", "medium")

        if not input_text:
            return _error(400, "text field is required")

        if len(input_text) > 8000:
            return _error(400, "text exceeds maximum length of 8000 characters")

        if length not in SUMMARY_INSTRUCTIONS:
            length = "medium"

        prompt_data = f"{SUMMARY_INSTRUCTIONS[length]}\n\n{input_text}"

        request_body = json.dumps({
            "messages": [
                {
                    "role": "user",
                    "content": [{"text": prompt_data}]
                }
            ],
            "inferenceConfig": {
                "maxTokens": 2048,
                "temperature": 0,
                "topP": 0.9
            }
        })

        response = bedrock_client.invoke_model(
            body=request_body,
            modelId=MODEL_ID,
            accept="application/json",
            contentType="application/json"
        )

        response_body = json.loads(response.get("body").read())

        summary_text = (
            response_body
            .get("output", {})
            .get("message", {})
            .get("content", [{}])[0]
            .get("text", "")
        )

        # ── Persist to DynamoDB ──
        item_id = str(uuid.uuid4())
        IST = timezone(timedelta(hours=5, minutes=30))
        timestamp = datetime.now(IST).isoformat()
        summary_text = summary_text.strip() if summary_text else "No summary generated"
        table.put_item(Item={
            "id":           item_id,
            "timestamp":    timestamp,
            "inputSnippet": input_text[:80] + ("…" if len(input_text) > 80 else ""),
            "inputLength":  len(input_text.split()),
            "summary":      summary_text,
            "length":       length,
        })
        print("Generated Summary Successfully")
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "id":        item_id,
                "input_text": input_text,
                "summary":   summary_text,
                "timestamp": timestamp,
                "length":    length,
            })
        }

    except botocore.exceptions.ClientError as error:
        code = error.response["Error"]["Code"]
        if code == "AccessDeniedException":
            return _error(403,f"Bedrock Access Error: {error}")
        return _error(500, f"AWS error: {error}")

    except Exception as e:
        print(f"Unhandled error: {e}")
        return _error(500, "Internal server error")


def _error(status, message):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps({"error": message})
    }
