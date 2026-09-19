import boto3
import json

dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
table = dynamodb.Table("TeamGateStack-TeamGateTable312B575D-G7BPEQMX9Y2S")

cognito = boto3.client("cognito-idp", region_name="ap-south-1")
USER_POOL_ID = "ap-south-1_7I0PAJ4Om"

print("--- COGNITO USERS ---")
users_res = cognito.list_users(UserPoolId=USER_POOL_ID)
for u in users_res.get("Users", []):
    uname = u.get("Username")
    attrs = {attr["Name"]: attr["Value"] for attr in u.get("Attributes", [])}
    grps = cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=uname)
    gnames = [g.get("GroupName") for g in grps.get("Groups", [])]
    print(f"User: {attrs.get('email')} | Sub: {uname} | Groups: {gnames}")

    # Query DB items
    res = table.query(
        IndexName="GSI1",
        KeyConditionExpression="GSI1PK = :user_pk",
        ExpressionAttributeValues={":user_pk": f"USER#{uname}"}
    )
    print(f"  DB Memberships: {res.get('Items')}\n")

print("--- WORKSPACE LIST ---")
res = table.query(
    IndexName="GSI1",
    KeyConditionExpression="GSI1PK = :ws",
    ExpressionAttributeValues={":ws": "WORKSPACE#LIST"}
)
for item in res.get("Items", []):
    print(f"  Workspace: {item.get('workspaceId')} | Name: {item.get('name')} | Owner: {item.get('ownerEmail')} | CreatedAt: {item.get('createdAt')}")
