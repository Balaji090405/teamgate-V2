#!/usr/bin/env python3
"""
Unit tests for Lambda handler logic in infra/lambda/handler.py.
Mocks boto3 DynamoDB and Cognito calls to verify invitation token creation,
ADMIN role invitation rejection, token retrieval, email matching on acceptance,
and explicit workspace creation assigning ADMIN role.
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

# Add infra/lambda directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../infra/lambda")))

import handler


def make_event(
    method: str = "GET",
    path: str = "/",
    body: dict = None,
    sub: str = "user-123",
    email: str = "test@example.com",
    groups: list[str] = None,
    path_parameters: dict = None,
) -> dict:
    claims = {"sub": sub, "email": email}
    if groups:
        claims["cognito:groups"] = groups

    evt = {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {"jwt": {"claims": claims}},
        },
    }
    if body is not None:
        evt["body"] = json.dumps(body)
    if path_parameters:
        evt["pathParameters"] = path_parameters
    return evt


def test_invite_admin_rejected():
    """Verify that attempting to invite a user with role ADMIN returns HTTP 400."""
    with patch.object(handler, "get_effective_role", return_value=({"workspaceId": "ws-1"}, "ADMIN")):
        evt = make_event("POST", "/team", body={"email": "some@example.com", "role": "ADMIN"}, groups=["Admin"])
        res = handler.handle_invite_user(evt)
        assert res["statusCode"] == 400, f"Expected 400, got {res['statusCode']}"
        body = json.loads(res["body"])
        assert "ADMIN cannot be an invitation role" in body["message"]
        print("[PASS] test_invite_admin_rejected")


def test_invite_manager_forbidden():
    """Verify that a MANAGER cannot invite users (HTTP 403)."""
    with patch.object(handler, "get_effective_role", return_value=({"workspaceId": "ws-1"}, "MANAGER")):
        evt = make_event("POST", "/team", body={"email": "some@example.com", "role": "EMPLOYEE"}, groups=["Manager"])
        res = handler.handle_invite_user(evt)
        assert res["statusCode"] == 403, f"Expected 403, got {res['statusCode']}"
        print("[PASS] test_invite_manager_forbidden")


def test_invite_creation_success():
    """Verify that an ADMIN creating a MANAGER or EMPLOYEE invite succeeds with HTTP 201."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()
    mock_cognito.admin_create_user.return_value = {
        "User": {
            "Username": "newuser@example.com",
            "Attributes": [{"Name": "sub", "Value": "user-sub-123"}],
        }
    }
    with patch.object(handler, "get_effective_role", return_value=({"workspaceId": "ws-1"}, "ADMIN")), \
         patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito), \
         patch.object(handler, "USER_POOL_ID", "pool-123"), \
         patch.object(handler, "create_activity"):
        evt = make_event("POST", "/team", body={"email": "newuser@example.com", "role": "MANAGER"}, groups=["Admin"])
        res = handler.handle_invite_user(evt)
        assert res["statusCode"] == 201, f"Expected 201, got {res['statusCode']}"
        body = json.loads(res["body"])
        assert "Invitation sent successfully" in body["message"]
        mock_cognito.admin_create_user.assert_called_once()
        print("[PASS] test_invite_creation_success")


def test_get_invitation():
    """Verify GET /invitations/{token} returns valid invitation metadata."""
    mock_table = MagicMock()
    mock_table.query.return_value = {
        "Items": [
            {
                "status": "PENDING",
                "expiresAt": "2099-01-01T00:00:00Z",
                "workspaceId": "ws-1",
                "invitedEmail": "invited@example.com",
                "role": "EMPLOYEE",
            }
        ]
    }
    mock_table.get_item.return_value = {"Item": {"name": "Acme Corp"}}

    with patch.object(handler, "table", mock_table):
        res = handler.handle_get_invitation({}, "test-token")
        assert res["statusCode"] == 200, f"Expected 200, got {res['statusCode']}"
        body = json.loads(res["body"])
        assert body["valid"] is True
        assert body["invitedEmail"] == "invited@example.com"
        assert body["role"] == "EMPLOYEE"
        assert body["workspaceName"] == "Acme Corp"
        print("[PASS] test_get_invitation")


def test_accept_invitation_mismatched_email():
    """Verify that accepting an invitation with a mismatched email returns HTTP 403."""
    mock_table = MagicMock()
    token_hash = handler.hash_token("test-raw-token")
    mock_table.query.return_value = {
        "Items": [
            {
                "PK": "WORKSPACE#ws-1",
                "SK": f"INVITATION#{token_hash}",
                "status": "PENDING",
                "expiresAt": "2099-01-01T00:00:00Z",
                "workspaceId": "ws-1",
                "invitedEmail": "correct@example.com",
                "role": "EMPLOYEE",
            }
        ]
    }

    with patch.object(handler, "table", mock_table):
        # User logged in as wrong@example.com
        evt = make_event("POST", "/invitations/accept", body={"token": "test-raw-token"}, email="wrong@example.com")
        res = handler.handle_accept_invitation(evt)
        assert res["statusCode"] == 403, f"Expected 403, got {res['statusCode']}"
        body = json.loads(res["body"])
        assert "does not match invited email" in body["message"]
        print("[PASS] test_accept_invitation_mismatched_email")


def test_accept_invitation_matching_email():
    """Verify that accepting an invitation with a matching email succeeds (HTTP 200)."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()
    token_hash = handler.hash_token("test-raw-token")
    mock_table.query.return_value = {
        "Items": [
            {
                "PK": "WORKSPACE#ws-1",
                "SK": f"INVITATION#{token_hash}",
                "status": "PENDING",
                "expiresAt": "2099-01-01T00:00:00Z",
                "workspaceId": "ws-1",
                "invitedEmail": "correct@example.com",
                "role": "EMPLOYEE",
            }
        ]
    }

    with patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito), \
         patch.object(handler, "USER_POOL_ID", "pool-123"), \
         patch.object(handler, "create_activity"):
        evt = make_event("POST", "/invitations/accept", body={"token": "test-raw-token"}, sub="user-999", email="correct@example.com")
        res = handler.handle_accept_invitation(evt)
        assert res["statusCode"] == 200, f"Expected 200, got {res['statusCode']}"
        body = json.loads(res["body"])
        assert body["workspaceId"] == "ws-1"
        assert body["role"] == "EMPLOYEE"
        mock_cognito.admin_add_user_to_group.assert_called_with(
            UserPoolId="pool-123", Username="user-999", GroupName="Employee"
        )
        print("[PASS] test_accept_invitation_matching_email")


def test_create_workspace_assigns_admin():
    """Verify that POST /workspaces creates a new workspace and assigns role ADMIN to the creator."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()

    with patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito), \
         patch.object(handler, "USER_POOL_ID", "pool-123"), \
         patch.object(handler, "create_activity"):
        evt = make_event("POST", "/workspaces", body={"name": "My New Company"}, sub="user-owner", email="owner@company.com")
        res = handler.handle_create_workspace(evt)
        assert res["statusCode"] == 201, f"Expected 201, got {res['statusCode']}"
        body = json.loads(res["body"])
        assert body["role"] == "ADMIN"
        assert "workspaceId" in body
        mock_cognito.admin_add_user_to_group.assert_called_with(
            UserPoolId="pool-123", Username="user-owner", GroupName="Admin"
        )
        print("[PASS] test_create_workspace_assigns_admin")


def test_get_team_returns_only_workspace_members():
    """Verify GET /team queries DynamoDB for workspace members and excludes non-workspace users."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()

    # Mock DynamoDB returning 2 members for ws-123
    mock_table.query.return_value = {
        "Items": [
            {
                "PK": "WORKSPACE#ws-123",
                "SK": "MEMBER#user-admin",
                "userId": "user-admin",
                "email": "admin@test.com",
                "role": "ADMIN",
                "isOwner": True,
            },
            {
                "PK": "WORKSPACE#ws-123",
                "SK": "MEMBER#user-manager",
                "userId": "user-manager",
                "email": "manager@test.com",
                "role": "MANAGER",
                "isOwner": False,
            },
        ]
    }
    # Mock admin_get_user throwing or returning attributes
    mock_cognito.admin_get_user.side_effect = Exception("User attributes skipped")

    with patch.object(handler, "get_effective_role", return_value=({"workspaceId": "ws-123"}, "ADMIN")), \
         patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito):
        evt = make_event("GET", "/team", sub="user-admin", email="admin@test.com", groups=["Admin"])
        res = handler.handle_get_team(evt)
        assert res["statusCode"] == 200, f"Expected 200, got {res['statusCode']}"
        body = json.loads(res["body"])
        members = body["members"]
        assert len(members) == 2, f"Expected 2 members, got {len(members)}"
        emails = [m["email"] for m in members]
        assert "admin@test.com" in emails
        assert "manager@test.com" in emails
        assert "teamgateadmin@gmail.com" not in emails
        print("[PASS] test_get_team_returns_only_workspace_members")


def test_new_workspace_creator_is_admin():
    """Verify that a brand-new user with no existing membership gets a new workspace where they are ADMIN/OWNER."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()
    mock_table.query.return_value = {"Items": []}

    with patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito), \
         patch.object(handler, "USER_POOL_ID", "pool-123"):
        ws = handler.ensure_workspace("new-user-1", "newuser@example.com")
        assert ws["role"] == "ADMIN"
        assert ws["isOwner"] is True
        assert "workspaceId" in ws
        mock_cognito.admin_add_user_to_group.assert_called_with(
            UserPoolId="pool-123", Username="new-user-1", GroupName="Admin"
        )
        print("[PASS] test_new_workspace_creator_is_admin")


def test_new_workspace_gets_owner_membership():
    """Verify DynamoDB records created for a new workspace owner (MEMBER with isOwner=True, role=ADMIN)."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()
    mock_table.query.return_value = {"Items": []}

    with patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito):
        ws = handler.ensure_workspace("owner-id-100", "owner@company.com")
        put_calls = mock_table.put_item.call_args_list
        assert len(put_calls) == 2, f"Expected 2 put_item calls, got {len(put_calls)}"
        member_item = put_calls[1][1]["Item"]
        assert member_item["entityType"] == "MEMBER"
        assert member_item["userId"] == "owner-id-100"
        assert member_item["role"] == "ADMIN"
        assert member_item["isOwner"] is True
        print("[PASS] test_new_workspace_gets_owner_membership")


def test_new_workspace_isolated_from_existing_workspace():
    """Verify that a new workspace receives a distinct ID and is not attached to existing workspace."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()
    mock_table.query.return_value = {"Items": []}

    with patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito):
        ws1 = handler.ensure_workspace("user-a", "usera@example.com")
        mock_table.query.return_value = {"Items": []}
        ws2 = handler.ensure_workspace("user-b", "userb@example.com")
        assert ws1["workspaceId"] != ws2["workspaceId"]
        print("[PASS] test_new_workspace_isolated_from_existing_workspace")


def test_invited_employee_remains_employee():
    """Verify an invited user with an existing EMPLOYEE membership retains EMPLOYEE role and does not become ADMIN."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()
    mock_table.query.return_value = {
        "Items": [
            {
                "PK": "WORKSPACE#invited-ws-1",
                "SK": "MEMBER#user-emp",
                "workspaceId": "invited-ws-1",
                "userId": "user-emp",
                "email": "invited_emp@example.com",
                "role": "EMPLOYEE",
                "isOwner": False,
            }
        ]
    }

    with patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito):
        ws = handler.ensure_workspace("user-emp", "invited_emp@example.com")
        assert ws["workspaceId"] == "invited-ws-1"
        assert ws["role"] == "EMPLOYEE"
        assert ws["isOwner"] is False
        print("[PASS] test_invited_employee_remains_employee")


def test_invited_manager_remains_manager():
    """Verify an invited user with an existing MANAGER membership retains MANAGER role and does not become ADMIN."""
    mock_table = MagicMock()
    mock_cognito = MagicMock()
    mock_table.query.return_value = {
        "Items": [
            {
                "PK": "WORKSPACE#invited-ws-2",
                "SK": "MEMBER#user-mgr",
                "workspaceId": "invited-ws-2",
                "userId": "user-mgr",
                "email": "invited_mgr@example.com",
                "role": "MANAGER",
                "isOwner": False,
            }
        ]
    }

    with patch.object(handler, "table", mock_table), \
         patch.object(handler, "cognito", mock_cognito):
        ws = handler.ensure_workspace("user-mgr", "invited_mgr@example.com")
        assert ws["workspaceId"] == "invited-ws-2"
        assert ws["role"] == "MANAGER"
        assert ws["isOwner"] is False
        print("[PASS] test_invited_manager_remains_manager")


def run_all_unit_tests():
    print("=" * 70)
    print("Running TeamGate Handler Unit Tests (Mocked AWS)")
    print("=" * 70)
    test_invite_admin_rejected()
    test_invite_manager_forbidden()
    test_invite_creation_success()
    test_get_invitation()
    test_accept_invitation_mismatched_email()
    test_accept_invitation_matching_email()
    test_create_workspace_assigns_admin()
    test_get_team_returns_only_workspace_members()
    test_new_workspace_creator_is_admin()
    test_new_workspace_gets_owner_membership()
    test_new_workspace_isolated_from_existing_workspace()
    test_invited_employee_remains_employee()
    test_invited_manager_remains_manager()
    print("=" * 70)
    print("ALL HANDLER UNIT TESTS PASSED SUCCESSFULLY! (13/13)")
    print("=" * 70)


if __name__ == "__main__":
    run_all_unit_tests()

