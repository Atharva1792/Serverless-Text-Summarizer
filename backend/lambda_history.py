import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get("HISTORY_TABLE", None))

CORS_HEADERS = {
    "Access-Control-Allow-Origin": os.environ.get("ALLOWED_ORIGIN", None),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
}

def convert_decimals(obj):
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    else:
        return obj

def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        
        response = table.scan(
            ProjectionExpression="id, #ts, inputSnippet, inputLength, summary, #len",
            ExpressionAttributeNames={
                "#ts":  "timestamp",
                "#len": "length",
            }
        )

        items = response.get("Items", [])

        # Sort by timestamp descending
        items.sort(
            key=lambda x: x.get("timestamp", ""),
            reverse=True
        )

        # Cap at 20 most recent
        items = items[:20]
        items = convert_decimals(items)
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"history": items})
        }

    except Exception as e:
        print(f"Error fetching history: {e}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to fetch history"})
        }
