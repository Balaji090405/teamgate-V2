import boto3

dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
table = dynamodb.Table("TeamGateStack-TeamGateTable312B575D-G7BPEQMX9Y2S")

PRIMARY_WS_ID = "ea3ea409-3b6d-4730-bdd7-84b8425e0d22"

print("--- CLEANING UP EXTRA TEST WORKSPACES ---")
res = table.query(
    IndexName="GSI1",
    KeyConditionExpression="GSI1PK = :ws",
    ExpressionAttributeValues={":ws": "WORKSPACE#LIST"}
)

extra_ws_ids = []
for item in res.get("Items", []):
    ws_id = item.get("workspaceId")
    if ws_id and ws_id != PRIMARY_WS_ID:
        extra_ws_ids.append(ws_id)

print(f"Extra workspaces to remove: {extra_ws_ids}")

for ws_id in extra_ws_ids:
    # Delete all items under WORKSPACE#{ws_id}
    query_res = table.query(
        KeyConditionExpression="PK = :pk",
        ExpressionAttributeValues={":pk": f"WORKSPACE#{ws_id}"}
    )
    for item in query_res.get("Items", []):
        table.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
        print(f"Deleted {item['PK']} {item['SK']}")

# Also delete member items for badadmininvite@test.com or temp test users
res_admin = table.query(
    IndexName="GSI1",
    KeyConditionExpression="GSI1PK = :user_pk",
    ExpressionAttributeValues={":user_pk": "USER#a1d34d8a-e0f1-7083-dbb2-4304bb249c3e"}
)
for item in res_admin.get("Items", []):
    if item.get("workspaceId") != PRIMARY_WS_ID:
        table.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})

print("Cleanup completed successfully.")
