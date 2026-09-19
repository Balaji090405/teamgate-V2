import json
import os
import uuid
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

TABLE_NAME = os.environ.get("TABLE_NAME", "")
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
DEFAULT_ADMIN_EMAIL = os.environ.get("DEFAULT_ADMIN_EMAIL", "teamgate@gmail.com")
BOOTSTRAP_ADMIN_SECRET_ARN = os.environ.get("BOOTSTRAP_ADMIN_SECRET_ARN", "")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME) if TABLE_NAME else None
cognito = boto3.client("cognito-idp")
secretsmanager = boto3.client("secretsmanager") if (BOOTSTRAP_ADMIN_SECRET_ARN or os.environ.get("AWS_REGION")) else None


def get_bootstrap_admin_password() -> str:
    """Retrieve the bootstrap admin password from AWS Secrets Manager at runtime."""
    if BOOTSTRAP_ADMIN_SECRET_ARN and secretsmanager:
        try:
            res = secretsmanager.get_secret_value(SecretId=BOOTSTRAP_ADMIN_SECRET_ARN)
            secret_str = res.get("SecretString", "")
            if secret_str:
                try:
                    data = json.loads(secret_str)
                    if isinstance(data, dict) and "password" in data:
                        return data["password"]
                except json.JSONDecodeError:
                    return secret_str
        except Exception as e:
            print("Secrets Manager fetch error:", e)
    raise RuntimeError("Bootstrap admin secret could not be retrieved from AWS Secrets Manager.")


def ensure_default_admin():
    """Ensure default bootstrap admin user exists in Cognito and DynamoDB (idempotent)."""
    if not USER_POOL_ID or not DEFAULT_ADMIN_EMAIL:
        return
    try:
        user_id = None
        try:
            res = cognito.admin_get_user(UserPoolId=USER_POOL_ID, Username=DEFAULT_ADMIN_EMAIL)
            user_id = res.get("Username")
        except ClientError as ce:
            if ce.response.get("Error", {}).get("Code") == "UserNotFoundException":
                pwd = get_bootstrap_admin_password()
                create_res = cognito.admin_create_user(
                    UserPoolId=USER_POOL_ID,
                    Username=DEFAULT_ADMIN_EMAIL,
                    UserAttributes=[
                        {"Name": "email", "Value": DEFAULT_ADMIN_EMAIL},
                        {"Name": "email_verified", "Value": "true"},
                    ],
                    MessageAction="SUPPRESS",
                    TemporaryPassword=pwd,
                )
                user_id = create_res.get("User", {}).get("Username") or DEFAULT_ADMIN_EMAIL
                try:
                    cognito.admin_set_user_password(
                        UserPoolId=USER_POOL_ID,
                        Username=DEFAULT_ADMIN_EMAIL,
                        Password=pwd,
                        Permanent=True,
                    )
                except Exception as pe:
                    print("Failed to set permanent password for bootstrap admin:", pe)
            else:
                print("Cognito admin_get_user error:", ce)

        if user_id:
            try:
                cognito.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=user_id, GroupName="Admin")
            except Exception as ge:
                print("Failed to add default admin to Admin group:", ge)
            ensure_workspace(user_id, DEFAULT_ADMIN_EMAIL, initial_role="ADMIN")
    except Exception as e:
        print("Idempotent ensure_default_admin error:", e)


def response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body),
    }


def get_claims(event: dict) -> dict:
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )


def get_user_id(event: dict) -> str | None:
    claims = get_claims(event)
    sub = claims.get("sub")
    return sub if isinstance(sub, str) and sub else None


def get_email(event: dict) -> str | None:
    claims = get_claims(event)
    email = claims.get("email")
    return email if isinstance(email, str) and email else None


def get_cognito_role(event: dict) -> str | None:
    claims = get_claims(event)
    groups = claims.get("cognito:groups")
    if isinstance(groups, list):
        if "Admin" in groups:
            return "ADMIN"
        if "Manager" in groups:
            return "MANAGER"
        if "Employee" in groups:
            return "EMPLOYEE"
    elif isinstance(groups, str):
        if groups == "Admin":
            return "ADMIN"
        if groups == "Manager":
            return "MANAGER"
        if groups == "Employee":
            return "EMPLOYEE"
    return None


def parse_body(event: dict) -> dict:
    body_str = event.get("body")
    if not body_str:
        return {}
    try:
        parsed = json.loads(body_str)
        if isinstance(parsed, dict):
            return parsed
        return {}
    except Exception:
        raise ValueError("INVALID_JSON")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id() -> str:
    return str(uuid.uuid4())


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def seven_days_from_now_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=7)).isoformat().replace("+00:00", "Z")


def get_workspace_for_user(user_id: str) -> dict | None:
    res = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"USER#{user_id}"),
    )
    items = res.get("Items", [])
    if not items:
        return None

    data = items[0]
    return {
        "workspaceId": data.get("workspaceId"),
        "role": data.get("role"),
        "isOwner": data.get("isOwner") is True,
    }


PRIMARY_WORKSPACE_ID = None


def get_primary_workspace_id() -> str | None:
    return PRIMARY_WORKSPACE_ID


def ensure_workspace(user_id: str, email: str, initial_role: str | None = None) -> dict:
    existing = get_workspace_for_user(user_id)
    if existing:
        return existing

    ws_id = new_id()
    timestamp = now_iso()
    ws_name = f"{email.split('@')[0]}'s Workspace"
    table.put_item(
        Item={
            "PK": f"WORKSPACE#{ws_id}",
            "SK": "METADATA",
            "GSI1PK": "WORKSPACE#LIST",
            "GSI1SK": "METADATA",
            "entityType": "WORKSPACE",
            "workspaceId": ws_id,
            "name": ws_name,
            "ownerId": user_id,
            "ownerEmail": email,
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
    )
    table.put_item(
        Item={
            "PK": f"WORKSPACE#{ws_id}",
            "SK": f"MEMBER#{user_id}",
            "GSI1PK": f"USER#{user_id}",
            "GSI1SK": f"WORKSPACE#{ws_id}",
            "entityType": "MEMBER",
            "workspaceId": ws_id,
            "userId": user_id,
            "email": email,
            "role": "ADMIN",
            "isOwner": True,
            "joinedAt": timestamp,
        }
    )
    try:
        cognito.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=user_id, GroupName="Admin")
    except Exception as e:
        print("Failed to add user to Admin group in ensure_workspace:", e)

    return {
        "workspaceId": ws_id,
        "role": "ADMIN",
        "isOwner": True,
    }


def get_effective_role(event: dict) -> tuple[dict, str]:
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        raise ValueError("UNAUTHORIZED")

    cognito_role = get_cognito_role(event)
    ws = ensure_workspace(user_id, email, cognito_role)

    if ws.get("isOwner") or cognito_role == "ADMIN" or ws.get("role") == "ADMIN":
        ws["role"] = "ADMIN"
        return ws, "ADMIN"

    if cognito_role == "MANAGER" or ws.get("role") == "MANAGER":
        ws["role"] = "MANAGER"
        return ws, "MANAGER"

    effective = ws.get("role") or cognito_role or "EMPLOYEE"
    ws["role"] = effective
    return ws, effective


def can_view_projects(role: str) -> bool:
    return role in ("ADMIN", "MANAGER", "EMPLOYEE")


def can_create_project(role: str) -> bool:
    return role in ("ADMIN", "MANAGER")


def can_edit_project(role: str) -> bool:
    return role in ("ADMIN", "MANAGER")


def can_delete_project(role: str) -> bool:
    return role == "ADMIN"


def can_manage_team(role: str) -> bool:
    return role in ("ADMIN", "MANAGER")


def can_change_role(role: str) -> bool:
    return role == "ADMIN"


def create_activity(ws_id: str, actor_id: str, action: str, target_id: str, desc: str):
    timestamp = now_iso()
    table.put_item(
        Item={
            "PK": f"WORKSPACE#{ws_id}",
            "SK": f"ACTIVITY#{timestamp}#{new_id()}",
            "entityType": "ACTIVITY",
            "workspaceId": ws_id,
            "actorId": actor_id,
            "action": action,
            "targetId": target_id,
            "description": desc,
            "createdAt": timestamp,
        }
    )


# --- Endpoint Handlers ---

def handle_get_me(event: dict):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unable to identify authenticated user."})

    ws, role = get_effective_role(event)
    return response(
        200,
        {
            "user": {"id": user_id, "email": email},
            "workspace": {**ws, "role": role},
        },
    )


def handle_get_projects(event: dict):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_view_projects(role):
        return response(403, {"message": "You do not have permission to view projects."})

    res = table.query(
        KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{ws['workspaceId']}") & Key("SK").begins_with("PROJECT#")
    )
    return response(200, {"projects": res.get("Items", [])})


def handle_create_project(event: dict):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_create_project(role):
        return response(403, {"message": "Only admins can create projects."})

    try:
        body = parse_body(event)
    except Exception:
        return response(400, {"message": "Invalid JSON."})

    name = str(body.get("name", "")).strip()
    description = str(body.get("description", "")).strip()
    status = str(body.get("status", "PLANNING")).upper()

    if not name:
        return response(400, {"message": "Project name is required."})

    if status not in ("PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"):
        return response(400, {"message": "Invalid project status."})

    attachment = None
    att_raw = body.get("attachment")
    if isinstance(att_raw, dict):
        fn = att_raw.get("fileName")
        fd = att_raw.get("fileData")
        if isinstance(fn, str) and isinstance(fd, str):
            ext = fn.split(".")[-1].lower() if "." in fn else ""
            if ext in ("jpg", "jpeg", "png", "pdf", "docx"):
                attachment = {
                    "fileName": fn,
                    "fileType": str(att_raw.get("fileType", "application/octet-stream")),
                    "fileData": fd,
                }
            else:
                return response(400, {"message": "Invalid file format. Allowed formats: JPG, PNG, PDF, DOCX."})

    project_id = new_id()
    timestamp = now_iso()
    project = {
        "id": project_id,
        "workspaceId": ws["workspaceId"],
        "name": name,
        "description": description,
        "status": status,
        "createdBy": user_id,
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }
    if attachment:
        project["attachment"] = attachment

    table.put_item(
        Item={
            "PK": f"WORKSPACE#{ws['workspaceId']}",
            "SK": f"PROJECT#{project_id}",
            "entityType": "PROJECT",
            **project,
        }
    )

    create_activity(
        ws["workspaceId"], user_id, "PROJECT_CREATED", project_id, f'Created project "{name}"'
    )
    return response(201, {"project": project})


def handle_update_project(event: dict, project_id: str):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_edit_project(role):
        return response(403, {"message": "You do not have permission to edit projects."})

    try:
        body = parse_body(event)
    except Exception:
        return response(400, {"message": "Invalid JSON."})

    name = str(body.get("name", "")).strip()
    description = str(body.get("description", "")).strip()
    status = str(body.get("status", "PLANNING")).upper()

    if not name:
        return response(400, {"message": "Project name is required."})
    if status not in ("PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"):
        return response(400, {"message": "Invalid project status."})

    existing = table.get_item(Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"PROJECT#{project_id}"})
    if "Item" not in existing:
        return response(404, {"message": "Project not found."})

    updated_at = now_iso()
    table.update_item(
        Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"PROJECT#{project_id}"},
        UpdateExpression="SET #name = :name, #description = :description, #status = :status, #updatedAt = :updatedAt",
        ExpressionAttributeNames={
            "#name": "name",
            "#description": "description",
            "#status": "status",
            "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues={
            ":name": name,
            ":description": description,
            ":status": status,
            ":updatedAt": updated_at,
        },
    )

    create_activity(ws["workspaceId"], user_id, "PROJECT_UPDATED", project_id, f'Updated project "{name}"')
    return response(200, {"message": "Project updated successfully."})


def handle_delete_project(event: dict, project_id: str):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_delete_project(role):
        return response(403, {"message": "You do not have permission to delete projects."})

    existing = table.get_item(Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"PROJECT#{project_id}"})
    if "Item" not in existing:
        return response(404, {"message": "Project not found."})

    project_item = existing["Item"]
    table.delete_item(Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"PROJECT#{project_id}"})

    create_activity(ws["workspaceId"], user_id, "PROJECT_DELETED", project_id, f'Deleted project "{project_item.get("name", "")}"')
    return response(200, {"message": "Project deleted successfully."})


def handle_get_team(event: dict):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_manage_team(role):
        return response(403, {"message": "You do not have permission to manage the team."})

    ws_id = ws["workspaceId"]
    res = table.query(
        KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{ws_id}") & Key("SK").begins_with("MEMBER#")
    )
    items = res.get("Items", [])

    members = []
    for item in items:
        uid = item.get("userId") or item.get("SK", "").replace("MEMBER#", "")
        if not uid:
            continue

        member_email = item.get("email", "")
        member_role = item.get("role", "EMPLOYEE")
        is_owner = item.get("isOwner") is True
        member_name = item.get("name")
        member_status = "CONFIRMED"

        try:
            cog_user = cognito.admin_get_user(UserPoolId=USER_POOL_ID, Username=uid)
            attrs = {attr["Name"]: attr["Value"] for attr in cog_user.get("UserAttributes", [])}
            if attrs.get("email"):
                member_email = attrs.get("email")
            if attrs.get("name"):
                member_name = attrs.get("name")
            if cog_user.get("UserStatus"):
                member_status = cog_user.get("UserStatus")

            grps = cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=uid)
            gnames = [g.get("GroupName") for g in grps.get("Groups", [])]
            if "Admin" in gnames:
                member_role = "ADMIN"
            elif "Manager" in gnames and member_role != "ADMIN":
                member_role = "MANAGER"
        except Exception as e:
            print(f"Cognito lookup skipped for user {uid}:", e)

        if is_owner:
            member_role = "ADMIN"

        members.append({
            "id": uid,
            "userId": uid,
            "email": member_email,
            "name": member_name,
            "role": member_role,
            "status": member_status,
            "isOwner": is_owner,
        })

    return response(200, {"members": members})


def handle_change_user_role(event: dict, target_user_id: str):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_change_role(role):
        return response(403, {"message": "You do not have permission to change roles."})

    if target_user_id == user_id:
        return response(400, {"message": "You cannot change your own role."})

    try:
        body = parse_body(event)
    except Exception:
        return response(400, {"message": "Invalid JSON."})

    new_role = str(body.get("role", "")).upper()
    if new_role not in ("ADMIN", "MANAGER", "EMPLOYEE"):
        return response(400, {"message": "Invalid role."})

    existing = table.get_item(Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"MEMBER#{target_user_id}"})
    if "Item" not in existing:
        return response(404, {"message": "User is not a member of this workspace."})

    member = existing["Item"]
    if member.get("isOwner") is True:
        return response(400, {"message": "The workspace owner role cannot be changed."})

    try:
        grps = cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=target_user_id)
        c_groups = [g.get("GroupName") for g in grps.get("Groups", [])]
    except Exception as e:
        print("Unable to list user groups:", e)
        return response(500, {"message": "Unable to read user role."})

    for g in ("Admin", "Manager", "Employee"):
        if g in c_groups:
            try:
                cognito.admin_remove_user_from_group(UserPoolId=USER_POOL_ID, Username=target_user_id, GroupName=g)
            except Exception:
                pass

    cognito_group = "Admin" if new_role == "ADMIN" else ("Manager" if new_role == "MANAGER" else "Employee")
    cognito.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=target_user_id, GroupName=cognito_group)

    table.update_item(
        Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"MEMBER#{target_user_id}"},
        UpdateExpression="SET #role = :role",
        ExpressionAttributeNames={"#role": "role"},
        ExpressionAttributeValues={":role": new_role},
    )

    create_activity(ws["workspaceId"], user_id, "ROLE_CHANGED", target_user_id, f"Changed {member.get('email', target_user_id)}'s role to {new_role}")
    return response(200, {"message": "Role updated successfully.", "userId": target_user_id, "role": new_role})


def handle_invite_user(event: dict):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_change_role(role):
        return response(403, {"message": "You do not have permission to invite users."})

    try:
        body = parse_body(event)
    except Exception:
        return response(400, {"message": "Invalid JSON."})

    invite_email = str(body.get("email", "")).strip().lower()
    invite_name = str(body.get("name", "")).strip() if body.get("name") else None
    invite_role = str(body.get("role", "EMPLOYEE")).upper()

    if not invite_email or "@" not in invite_email:
        return response(400, {"message": "Valid email is required."})

    if invite_role not in ("ADMIN", "MANAGER", "EMPLOYEE"):
        return response(400, {"message": "Invalid role. Allowed invitation roles are ADMIN, MANAGER, and EMPLOYEE."})

    user_attrs = [{"Name": "email", "Value": invite_email}]
    if invite_name:
        user_attrs.append({"Name": "name", "Value": invite_name})

    try:
        cog_res = cognito.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=invite_email,
            UserAttributes=user_attrs,
            DesiredDeliveryMediums=["EMAIL"],
        )
    except ClientError as err:
        err_code = err.response.get("Error", {}).get("Code")
        if err_code in ("UsernameExistsException", "EntityAlreadyExistsException"):
            return response(409, {"message": "An account with this email already exists."})
        print("Cognito admin_create_user failed:", err)
        return response(400, {"message": f"Could not create user invitation: {err.response.get('Error', {}).get('Message', str(err))}"})
    except Exception as err:
        print("Cognito admin_create_user unexpected error:", err)
        return response(500, {"message": "Failed to create user in authentication system."})

    new_user = cog_res.get("User", {})
    new_user_attrs = {attr["Name"]: attr["Value"] for attr in new_user.get("Attributes", [])}
    cognito_sub = new_user_attrs.get("sub") or new_user.get("Username") or invite_email

    group_name = "Admin" if invite_role == "ADMIN" else ("Manager" if invite_role == "MANAGER" else "Employee")
    try:
        cognito.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=cognito_sub, GroupName=group_name)
    except Exception as err:
        print("Failed to add invited user to Cognito group:", err)

    timestamp = now_iso()
    member_item = {
        "PK": f"WORKSPACE#{ws['workspaceId']}",
        "SK": f"MEMBER#{cognito_sub}",
        "GSI1PK": f"USER#{cognito_sub}",
        "GSI1SK": f"WORKSPACE#{ws['workspaceId']}",
        "entityType": "MEMBER",
        "workspaceId": ws["workspaceId"],
        "userId": cognito_sub,
        "email": invite_email,
        "role": invite_role,
        "isOwner": False,
        "joinedAt": timestamp,
    }
    if invite_name:
        member_item["name"] = invite_name

    table.put_item(Item=member_item)

    create_activity(ws["workspaceId"], user_id, "USER_INVITED", cognito_sub, f"Sent invitation to {invite_email} as {invite_role}")

    return response(201, {
        "message": "Invitation sent successfully",
        "email": invite_email,
        "role": invite_role,
    })


def handle_get_invitation(event: dict, raw_token: str):
    if not raw_token:
        return response(400, {"message": "Token is required."})

    token_hash = hash_token(raw_token)
    res = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"INVITATION#{token_hash}") & Key("GSI1SK").eq("METADATA"),
        Limit=1,
    )
    items = res.get("Items", [])
    if not items:
        return response(404, {"message": "Invalid or non-existent invitation token."})

    inv = items[0]
    if inv.get("status") != "PENDING":
        return response(400, {"message": f"Invitation is no longer pending (status: {inv.get('status')})."})
    if now_iso() > inv.get("expiresAt", ""):
        return response(400, {"message": "Invitation has expired."})

    ws_name = "TeamGate Workspace"
    ws_item = table.get_item(Key={"PK": f"WORKSPACE#{inv['workspaceId']}", "SK": "METADATA"}).get("Item")
    if ws_item:
        ws_name = ws_item.get("name", ws_name)

    return response(200, {
        "valid": True,
        "invitedEmail": inv.get("invitedEmail"),
        "role": inv.get("role"),
        "workspaceId": inv.get("workspaceId"),
        "workspaceName": ws_name,
        "expiresAt": inv.get("expiresAt"),
    })


def handle_accept_invitation(event: dict):
    try:
        user_id = get_user_id(event)
        email = get_email(event)
        if not user_id or not email:
            return response(401, {"message": "Unauthorized."})

        body = parse_body(event)
        raw_token = str(body.get("token", "")).strip()
        if not raw_token:
            return response(400, {"message": "Token is required."})

        token_hash = hash_token(raw_token)
        res = table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"INVITATION#{token_hash}") & Key("GSI1SK").eq("METADATA"),
            Limit=1,
        )
        items = res.get("Items", [])
        if not items:
            return response(400, {"message": "Invalid or non-existent invitation token."})

        inv = items[0]
        if inv.get("status") != "PENDING":
            return response(400, {"message": "Invitation is no longer pending."})
        if now_iso() > inv.get("expiresAt", ""):
            return response(400, {"message": "Invitation has expired."})

        auth_email = email.strip().lower()
        invited_email = inv.get("invitedEmail", "").strip().lower()
        if auth_email != invited_email:
            return response(403, {"message": f"Authenticated email ({auth_email}) does not match invited email ({invited_email})."})

        ws_id = inv.get("workspaceId")
        if not ws_id:
            return response(400, {"message": "Invalid invitation record: workspaceId missing."})

        try:
            table.update_item(
                Key={"PK": f"WORKSPACE#{ws_id}", "SK": f"INVITATION#{token_hash}"},
                UpdateExpression="SET #status = :accepted, acceptedBy = :user_id, acceptedAt = :now",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":accepted": "ACCEPTED",
                    ":user_id": user_id,
                    ":now": now_iso(),
                    ":pending": "PENDING",
                },
                ConditionExpression="#status = :pending",
            )
        except ClientError as err:
            if err.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return response(400, {"message": "Invitation has already been accepted."})
            raise

        target_role = inv.get("role", "EMPLOYEE")
        if target_role not in ("MANAGER", "EMPLOYEE"):
            target_role = "EMPLOYEE"

        timestamp = now_iso()
        table.put_item(
            Item={
                "PK": f"WORKSPACE#{ws_id}",
                "SK": f"MEMBER#{user_id}",
                "GSI1PK": f"USER#{user_id}",
                "GSI1SK": f"WORKSPACE#{ws_id}",
                "entityType": "MEMBER",
                "workspaceId": ws_id,
                "userId": user_id,
                "email": auth_email,
                "role": target_role,
                "isOwner": False,
                "joinedAt": timestamp,
            }
        )

        cognito_group = "Manager" if target_role == "MANAGER" else "Employee"
        try:
            cognito.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=user_id, GroupName=cognito_group)
        except Exception as e:
            print("Failed to add user to Cognito group during invite acceptance:", e)

        create_activity(ws_id, user_id, "INVITATION_ACCEPTED", user_id, f"{auth_email} accepted invitation as {target_role}")
        return response(200, {
            "message": "Invitation accepted successfully.",
            "workspaceId": ws_id,
            "role": target_role,
        })
    except Exception as err:
        print(f"Exception in handle_accept_invitation: {err}")
        return response(500, {"message": f"ERROR: {str(err)}"})





def handle_delete_user(event: dict, target_user_id: str):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    if not can_change_role(role):
        return response(403, {"message": "You do not have permission to delete users."})

    if target_user_id == user_id:
        return response(400, {"message": "You cannot delete yourself."})

    existing = table.get_item(Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"MEMBER#{target_user_id}"})
    if "Item" not in existing:
        return response(404, {"message": "User is not a member of this workspace."})

    member = existing["Item"]
    if member.get("isOwner") is True:
        return response(400, {"message": "The workspace owner cannot be deleted."})

    table.delete_item(Key={"PK": f"WORKSPACE#{ws['workspaceId']}", "SK": f"MEMBER#{target_user_id}"})

    try:
        cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=target_user_id)
    except Exception as e:
        print("Unable to delete Cognito user:", e)

    create_activity(ws["workspaceId"], user_id, "USER_DELETED", target_user_id, f"Deleted user {member.get('email') or target_user_id}")
    return response(200, {"message": "User deleted successfully.", "userId": target_user_id})


def handle_get_activity(event: dict):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, _ = get_effective_role(event)
    res = table.query(
        KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{ws['workspaceId']}") & Key("SK").begins_with("ACTIVITY#"),
        ScanIndexForward=False,
        Limit=20,
    )
    return response(200, {"activities": res.get("Items", [])})


def handle_get_dashboard(event: dict):
    user_id = get_user_id(event)
    email = get_email(event)
    if not user_id or not email:
        return response(401, {"message": "Unauthorized."})

    ws, role = get_effective_role(event)
    res = table.query(
        KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{ws['workspaceId']}") & Key("SK").begins_with("PROJECT#")
    )
    projects = res.get("Items", [])

    team_res = table.query(KeyConditionExpression=Key("PK").eq(f"WORKSPACE#{ws['workspaceId']}"))
    members = [i for i in team_res.get("Items", []) if i.get("entityType") == "MEMBER"]

    sorted_projects = sorted(projects, key=lambda p: p.get("updatedAt", ""), reverse=True)
    return response(200, {"workspace": ws, "role": role, "projects": sorted_projects, "members": members})


def handler(event: dict, context=None):
    http_ctx = event.get("requestContext", {}).get("http", {})
    method = http_ctx.get("method", "")
    raw_path = event.get("rawPath", "")

    try:
        if method == "GET" and raw_path == "/me":
            return handle_get_me(event)
        if method == "GET" and raw_path == "/dashboard":
            return handle_get_dashboard(event)
        if method == "GET" and raw_path == "/projects":
            return handle_get_projects(event)
        if method == "POST" and raw_path == "/projects":
            return handle_create_project(event)
        if method == "PUT" and raw_path.startswith("/projects/"):
            project_id = raw_path[len("/projects/") :]
            return handle_update_project(event, project_id)
        if method == "DELETE" and raw_path.startswith("/projects/"):
            project_id = raw_path[len("/projects/") :]
            return handle_delete_project(event, project_id)
        if method == "GET" and raw_path == "/team":
            return handle_get_team(event)
        if method == "POST" and raw_path == "/team":
            return handle_invite_user(event)
        if method == "GET" and raw_path.startswith("/invitations/") and not raw_path.endswith("/accept"):
            raw_token = raw_path[len("/invitations/") :]
            return handle_get_invitation(event, raw_token)
        if method == "POST" and raw_path == "/invitations/accept":
            return handle_accept_invitation(event)
        if method == "DELETE" and raw_path.startswith("/team/") and not raw_path.endswith("/role"):
            target_user_id = raw_path[len("/team/") :]
            return handle_delete_user(event, target_user_id)
        if method == "PUT" and raw_path.startswith("/team/") and raw_path.endswith("/role"):
            target_user_id = raw_path[len("/team/") : -len("/role")]
            return handle_change_user_role(event, target_user_id)
        if method == "GET" and raw_path == "/activity":
            return handle_get_activity(event)

        return response(404, {"message": "Route not found."})
    except ValueError as ve:
        if str(ve) == "UNAUTHORIZED":
            return response(401, {"message": "Unauthorized."})
        return response(400, {"message": str(ve)})
    except Exception as e:
        print("Unhandled Lambda error:", e)
        return response(500, {"message": "Internal server error."})
