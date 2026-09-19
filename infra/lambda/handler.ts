import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

type Workspace = {
  workspaceId: string;
  role: Role;
  isOwner: boolean;
};

type ProjectAttachment = {
  fileName: string;
  fileType: string;
  fileData: string;
};

type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  attachment?: ProjectAttachment;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/* =========================================================
   RESPONSE
========================================================= */

function response(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Authorization,Content-Type',
      'Access-Control-Allow-Methods':
        'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

/* =========================================================
   AUTHENTICATION
========================================================= */

function getClaims(
  event: APIGatewayProxyEventV2,
): Record<string, unknown> {
  return (
    event.requestContext.authorizer?.jwt?.claims ?? {}
  ) as Record<string, unknown>;
}

function getUserId(
  event: APIGatewayProxyEventV2,
): string | null {
  const claims = getClaims(event);
  const sub = claims.sub;

  if (typeof sub !== 'string' || !sub) {
    return null;
  }

  return sub;
}

function getEmail(
  event: APIGatewayProxyEventV2,
): string | null {
  const claims = getClaims(event);
  const email = claims.email;

  return typeof email === 'string'
    ? email
    : null;
}

/* =========================================================
   COGNITO ROLE
========================================================= */

function getCognitoRole(
  event: APIGatewayProxyEventV2,
): Role | null {
  const claims = getClaims(event);
  const groups = claims['cognito:groups'];

  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (group === 'Admin') {
        return 'ADMIN';
      }

      if (group === 'Manager') {
        return 'MANAGER';
      }

      if (group === 'Employee') {
        return 'EMPLOYEE';
      }
    }
  }

  if (typeof groups === 'string') {
    if (groups === 'Admin') {
      return 'ADMIN';
    }

    if (groups === 'Manager') {
      return 'MANAGER';
    }

    if (groups === 'Employee') {
      return 'EMPLOYEE';
    }
  }

  return null;
}

/* =========================================================
   BODY / HELPERS
========================================================= */

function parseBody(
  event: APIGatewayProxyEventV2,
): Record<string, unknown> {
  if (!event.body) {
    return {};
  }

  try {
    const parsed = JSON.parse(event.body);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

/* =========================================================
   WORKSPACE
========================================================= */

async function getWorkspaceForUser(
  userId: string,
): Promise<Workspace | null> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression:
        'GSI1PK = :pk',
      ExpressionAttributeValues: marshall({
        ':pk': `USER#${userId}`,
      }),
      Limit: 1,
    }),
  );

  const item = result.Items?.[0];

  if (!item) {
    return null;
  }

  const data = unmarshall(item);

  return {
    workspaceId: data.workspaceId,
    role: data.role,
    isOwner: data.isOwner === true,
  };
}

async function getPrimaryWorkspaceId(): Promise<string | null> {
  const adminId = '01633dfa-70e1-7041-b6db-8476aef7baa5';
  const adminWs = await getWorkspaceForUser(adminId);
  if (adminWs) {
    return adminWs.workspaceId;
  }

  try {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: marshall({
          ':pk': 'WORKSPACE#LIST',
        }),
        Limit: 1,
      }),
    );

    if (result.Items?.[0]) {
      const data = unmarshall(result.Items[0]);
      return data.workspaceId || null;
    }
  } catch (error) {
    console.error('Error fetching primary workspace ID:', error);
  }

  return null;
}

async function ensureWorkspace(
  userId: string,
  email: string,
  initialRole?: Role,
): Promise<Workspace> {
  const primaryWorkspaceId = await getPrimaryWorkspaceId();
  const existing =
    await getWorkspaceForUser(userId);

  if (existing && (!primaryWorkspaceId || existing.workspaceId === primaryWorkspaceId)) {
    return existing;
  }

  const timestamp = now();

  if (primaryWorkspaceId) {
    const memberRole = initialRole ?? 'EMPLOYEE';
    await dynamodb.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall({
          PK: `WORKSPACE#${primaryWorkspaceId}`,
          SK: `MEMBER#${userId}`,

          GSI1PK: `USER#${userId}`,
          GSI1SK: `WORKSPACE#${primaryWorkspaceId}`,

          entityType: 'MEMBER',

          workspaceId: primaryWorkspaceId,
          userId,
          email,

          role: memberRole,
          isOwner: false,

          joinedAt: timestamp,
        }),
      }),
    );

    return {
      workspaceId: primaryWorkspaceId,
      role: memberRole,
      isOwner: false,
    };
  }

  const workspaceId = newId();
  const workspaceName =
    `${email.split('@')[0]}'s Workspace`;

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        PK: `WORKSPACE#${workspaceId}`,
        SK: 'METADATA',

        GSI1PK: 'WORKSPACE#LIST',
        GSI1SK: 'METADATA',

        entityType: 'WORKSPACE',

        workspaceId,
        name: workspaceName,

        ownerId: userId,
        ownerEmail: email,

        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    }),
  );

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        PK: `WORKSPACE#${workspaceId}`,
        SK: `MEMBER#${userId}`,

        GSI1PK: `USER#${userId}`,
        GSI1SK: `WORKSPACE#${workspaceId}`,

        entityType: 'MEMBER',

        workspaceId,
        userId,
        email,

        role: 'ADMIN',
        isOwner: true,

        joinedAt: timestamp,
      }),
    }),
  );

  return {
    workspaceId,
    role: 'ADMIN',
    isOwner: true,
  };
}

/*
 * The Cognito token is the source of authorization.
 *
 * The workspace owner is always treated as ADMIN.
 * This also prevents the first workspace owner from
 * accidentally becoming an Employee if they do not yet
 * have an Admin Cognito group.
 */
async function getEffectiveRole(
  event: APIGatewayProxyEventV2,
): Promise<{
  workspace: Workspace;
  role: Role;
}> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    throw new Error('UNAUTHORIZED');
  }

  const cognitoRole = getCognitoRole(event);
  const workspace =
    await ensureWorkspace(userId, email, cognitoRole ?? undefined);

  if (workspace.isOwner) {
    return {
      workspace: {
        ...workspace,
        role: 'ADMIN',
      },
      role: 'ADMIN',
    };
  }

  const effectiveRole: Role =
    cognitoRole ?? workspace.role ?? 'EMPLOYEE';

  return {
    workspace: {
      ...workspace,
      role: effectiveRole,
    },
    role: effectiveRole,
  };
}

/* =========================================================
   RBAC
========================================================= */

function canViewProjects(
  role: Role,
): boolean {
  return (
    role === 'ADMIN' ||
    role === 'MANAGER' ||
    role === 'EMPLOYEE'
  );
}

function canCreateProject(
  role: Role,
): boolean {
  return (
    role === 'ADMIN' ||
    role === 'MANAGER'
  );
}

function canEditProject(
  role: Role,
): boolean {
  return (
    role === 'ADMIN' ||
    role === 'MANAGER'
  );
}

function canDeleteProject(
  role: Role,
): boolean {
  return role === 'ADMIN';
}

function canManageTeam(
  role: Role,
): boolean {
  return (
    role === 'ADMIN' ||
    role === 'MANAGER'
  );
}

function canChangeRole(
  role: Role,
): boolean {
  return role === 'ADMIN';
}

/* =========================================================
   /me
========================================================= */

async function getMe(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message:
        'Unable to identify authenticated user.',
    });
  }

  const { workspace, role } =
    await getEffectiveRole(event);

  return response(200, {
    user: {
      id: userId,
      email,
    },
    workspace: {
      ...workspace,
      role,
    },
  });
}

/* =========================================================
   GET PROJECTS
========================================================= */

async function getProjects(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } =
    await getEffectiveRole(event);

  if (!canViewProjects(role)) {
    return response(403, {
      message:
        'You do not have permission to view projects.',
    });
  }

  /*
   * IMPORTANT:
   *
   * Projects are queried by WORKSPACE#<workspaceId>.
   *
   * Therefore every user belonging to the same
   * workspace receives the same project list.
   */
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,

      KeyConditionExpression:
        'PK = :pk AND begins_with(SK, :sk)',

      ExpressionAttributeValues:
        marshall({
          ':pk':
            `WORKSPACE#${workspace.workspaceId}`,
          ':sk': 'PROJECT#',
        }),
    }),
  );

  const projects =
    (result.Items ?? []).map((item) =>
      unmarshall(item),
    );

  return response(200, {
    projects,
  });
}

/* =========================================================
   CREATE PROJECT
========================================================= */

async function createProject(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } =
    await getEffectiveRole(event);

  if (!canCreateProject(role)) {
    return response(403, {
      message:
        'Only admins can create projects.',
    });
  }

  let body: Record<string, unknown>;

  try {
    body = parseBody(event);
  } catch {
    return response(400, {
      message: 'Invalid JSON.',
    });
  }

  const name =
    typeof body.name === 'string'
      ? body.name.trim()
      : '';

  const description =
    typeof body.description === 'string'
      ? body.description.trim()
      : '';

  const status =
    typeof body.status === 'string'
      ? body.status.toUpperCase()
      : 'PLANNING';

  if (!name) {
    return response(400, {
      message:
        'Project name is required.',
    });
  }

  if (
    ![
      'PLANNING',
      'ACTIVE',
      'COMPLETED',
      'ARCHIVED',
    ].includes(status)
  ) {
    return response(400, {
      message:
        'Invalid project status.',
    });
  }

  let attachment: ProjectAttachment | undefined = undefined;
  if (body.attachment && typeof body.attachment === 'object') {
    const att = body.attachment as Record<string, unknown>;
    if (typeof att.fileName === 'string' && typeof att.fileData === 'string') {
      const ext = att.fileName.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'pdf', 'docx'].includes(ext || '')) {
        attachment = {
          fileName: att.fileName,
          fileType: typeof att.fileType === 'string' ? att.fileType : 'application/octet-stream',
          fileData: att.fileData,
        };
      } else {
        return response(400, {
          message:
            'Invalid file format. Allowed formats: JPG, PNG, PDF, DOCX.',
        });
      }
    }
  }

  const projectId = newId();
  const timestamp = now();

  const project: Project = {
    id: projectId,

    /*
     * THIS is what makes the project visible
     * to all users in this workspace.
     */
    workspaceId:
      workspace.workspaceId,

    name,
    description,

    status:
      status as Project['status'],

    ...(attachment ? { attachment } : {}),

    createdBy: userId,

    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,

      Item: marshall({
        PK:
          `WORKSPACE#${workspace.workspaceId}`,

        SK:
          `PROJECT#${projectId}`,

        entityType: 'PROJECT',

        ...project,
      }),
    }),
  );

  await createActivity(
    workspace.workspaceId,
    userId,
    'PROJECT_CREATED',
    projectId,
    `Created project "${name}"`,
  );

  return response(201, {
    project,
  });
}

/* =========================================================
   UPDATE PROJECT
========================================================= */

async function updateProject(
  event: APIGatewayProxyEventV2,
  projectId: string,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } =
    await getEffectiveRole(event);

  if (!canEditProject(role)) {
    return response(403, {
      message:
        'You do not have permission to edit projects.',
    });
  }

  let body: Record<string, unknown>;

  try {
    body = parseBody(event);
  } catch {
    return response(400, {
      message: 'Invalid JSON.',
    });
  }

  const name =
    typeof body.name === 'string'
      ? body.name.trim()
      : '';

  const description =
    typeof body.description === 'string'
      ? body.description.trim()
      : '';

  const status =
    typeof body.status === 'string'
      ? body.status.toUpperCase()
      : 'PLANNING';

  if (!name) {
    return response(400, {
      message:
        'Project name is required.',
    });
  }

  if (
    ![
      'PLANNING',
      'ACTIVE',
      'COMPLETED',
      'ARCHIVED',
    ].includes(status)
  ) {
    return response(400, {
      message:
        'Invalid project status.',
    });
  }

  /*
   * Query using the CURRENT user's workspace.
   *
   * This prevents a user from editing a project
   * belonging to another workspace.
   */
  const existing = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,

      Key: marshall({
        PK:
          `WORKSPACE#${workspace.workspaceId}`,

        SK:
          `PROJECT#${projectId}`,
      }),
    }),
  );

  if (!existing.Item) {
    return response(404, {
      message: 'Project not found.',
    });
  }

  const updatedAt = now();

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,

      Key: marshall({
        PK:
          `WORKSPACE#${workspace.workspaceId}`,

        SK:
          `PROJECT#${projectId}`,
      }),

      UpdateExpression:
        'SET #name = :name, #description = :description, #status = :status, #updatedAt = :updatedAt',

      ExpressionAttributeNames: {
        '#name': 'name',
        '#description':
          'description',
        '#status': 'status',
        '#updatedAt':
          'updatedAt',
      },

      ExpressionAttributeValues:
        marshall({
          ':name': name,
          ':description':
            description,
          ':status': status,
          ':updatedAt':
            updatedAt,
        }),
    }),
  );

  await createActivity(
    workspace.workspaceId,
    userId,
    'PROJECT_UPDATED',
    projectId,
    `Updated project "${name}"`,
  );

  return response(200, {
    message:
      'Project updated successfully.',
  });
}

/* =========================================================
   DELETE PROJECT
========================================================= */

async function deleteProject(
  event: APIGatewayProxyEventV2,
  projectId: string,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } =
    await getEffectiveRole(event);

  /*
   * ADMIN + MANAGER can delete.
   * EMPLOYEE gets 403.
   */
  if (!canDeleteProject(role)) {
    return response(403, {
      message:
        'You do not have permission to delete projects.',
    });
  }

  const existing = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,

      Key: marshall({
        PK:
          `WORKSPACE#${workspace.workspaceId}`,

        SK:
          `PROJECT#${projectId}`,
      }),
    }),
  );

  if (!existing.Item) {
    return response(404, {
      message: 'Project not found.',
    });
  }

  const project =
    unmarshall(existing.Item);

  await dynamodb.send(
    new DeleteItemCommand({
      TableName: TABLE_NAME,

      Key: marshall({
        PK:
          `WORKSPACE#${workspace.workspaceId}`,

        SK:
          `PROJECT#${projectId}`,
      }),
    }),
  );

  await createActivity(
    workspace.workspaceId,
    userId,
    'PROJECT_DELETED',
    projectId,
    `Deleted project "${project.name}"`,
  );

  return response(200, {
    message:
      'Project deleted successfully.',
  });
}

/* =========================================================
   TEAM
========================================================= */

async function getTeam(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { role } =
    await getEffectiveRole(event);

  if (!canManageTeam(role)) {
    return response(403, {
      message:
        'You do not have permission to manage the team.',
    });
  }

  /*
   * List all users in Cognito.
   *
   * This allows Admin to see every available
   * Cognito user.
   */
  const users: {
    id: string;
    userId: string;
    email: string;
    name?: string;
    role: Role;
    status?: string;
    isOwner?: boolean;
  }[] = [];

  let paginationToken:
    | string
    | undefined;

  do {
    const result =
      await cognito.send(
        new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          PaginationToken:
            paginationToken,
          Limit: 60,
        }),
      );

    for (const user of result.Users ?? []) {
      const id =
        user.Username ?? '';

      const emailAttribute =
        user.Attributes?.find(
          (attribute) =>
            attribute.Name === 'email',
        );

      const nameAttribute =
        user.Attributes?.find(
          (attribute) =>
            attribute.Name === 'name',
        );

      let userRole: Role =
        'EMPLOYEE';

      try {
        const groups =
          await cognito.send(
            new AdminListGroupsForUserCommand(
              {
                UserPoolId:
                  USER_POOL_ID,
                Username: id,
              },
            ),
          );

        const groupNames =
          groups.Groups?.map(
            (group) =>
              group.GroupName,
          ) ?? [];

        if (
          groupNames.includes(
            'Admin',
          )
        ) {
          userRole = 'ADMIN';
        } else if (
          groupNames.includes(
            'Manager',
          )
        ) {
          userRole = 'MANAGER';
        } else {
          userRole = 'EMPLOYEE';
        }
      } catch (error) {
        console.error(
          'Unable to read user groups:',
          error,
        );
      }

      users.push({
        id,
        userId: id,

        email:
          emailAttribute?.Value ??
          '',

        name:
          nameAttribute?.Value,

        role: userRole,

        status:
          user.UserStatus,

        isOwner: false,
      });
    }

    paginationToken =
      result.PaginationToken;
  } while (paginationToken);

  /*
   * Mark the actual workspace owner.
   */
  const workspace =
    await getWorkspaceForUser(userId);

  if (workspace) {
    const workspaceResult =
      await dynamodb.send(
        new QueryCommand({
          TableName:
            TABLE_NAME,

          KeyConditionExpression:
            'PK = :pk',

          ExpressionAttributeValues:
            marshall({
              ':pk':
                `WORKSPACE#${workspace.workspaceId}`,
            }),
        }),
      );

    const ownerItem =
      (workspaceResult.Items ?? [])
        .map((item) =>
          unmarshall(item),
        )
        .find(
          (item) =>
            item.entityType ===
              'MEMBER' &&
            item.isOwner === true,
        );

    if (ownerItem) {
      const owner =
        users.find(
          (user) =>
            user.id ===
            ownerItem.userId,
        );

      if (owner) {
        owner.isOwner = true;
        owner.role = 'ADMIN';
      }
    }
  }

  return response(200, {
    members: users,
  });
}

/* =========================================================
   CHANGE USER ROLE
========================================================= */

async function changeUserRole(
  event: APIGatewayProxyEventV2,
  targetUserId: string,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } =
    await getEffectiveRole(event);

  if (!canChangeRole(role)) {
    return response(403, {
      message:
        'You do not have permission to change roles.',
    });
  }

  if (targetUserId === userId) {
    return response(400, {
      message:
        'You cannot change your own role.',
    });
  }

  let body: Record<string, unknown>;

  try {
    body = parseBody(event);
  } catch {
    return response(400, {
      message: 'Invalid JSON.',
    });
  }

  const newRole =
    typeof body.role === 'string'
      ? body.role.toUpperCase()
      : '';

  if (
    ![
      'ADMIN',
      'MANAGER',
      'EMPLOYEE',
    ].includes(newRole)
  ) {
    return response(400, {
      message: 'Invalid role.',
    });
  }

  /*
   * Check whether the target user is the
   * workspace owner.
   */
  const existing =
    await dynamodb.send(
      new GetItemCommand({
        TableName:
          TABLE_NAME,

        Key: marshall({
          PK:
            `WORKSPACE#${workspace.workspaceId}`,

          SK:
            `MEMBER#${targetUserId}`,
        }),
      }),
    );

  if (!existing.Item) {
    return response(404, {
      message:
        'User is not a member of this workspace.',
    });
  }

  const member =
    unmarshall(existing.Item);

  if (member.isOwner === true) {
    return response(400, {
      message:
        'The workspace owner role cannot be changed.',
    });
  }

  /*
   * Read the target user's current
   * Cognito groups.
   */
  let currentGroups:
    | string[]
    | undefined;

  try {
    const groupResult =
      await cognito.send(
        new AdminListGroupsForUserCommand(
          {
            UserPoolId:
              USER_POOL_ID,

            Username:
              targetUserId,
          },
        ),
      );

    currentGroups =
      groupResult.Groups
        ?.map(
          (group) =>
            group.GroupName,
        )
        .filter(
          (
            group,
          ): group is string =>
            typeof group ===
            'string',
        );
  } catch (error) {
    console.error(
      'Unable to read target groups:',
      error,
    );

    return response(500, {
      message:
        'Unable to read user role.',
    });
  }

  /*
   * Remove existing role groups.
   */
  for (const group of [
    'Admin',
    'Manager',
    'Employee',
  ]) {
    if (
      currentGroups?.includes(
        group,
      )
    ) {
      await cognito.send(
        new AdminRemoveUserFromGroupCommand(
          {
            UserPoolId:
              USER_POOL_ID,

            Username:
              targetUserId,

            GroupName:
              group,
          },
        ),
      );
    }
  }

  /*
   * Add the new role group.
   */
  const cognitoGroup =
    newRole === 'ADMIN'
      ? 'Admin'
      : newRole === 'MANAGER'
        ? 'Manager'
        : 'Employee';

  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId:
        USER_POOL_ID,

      Username:
        targetUserId,

      GroupName:
        cognitoGroup,
    }),
  );

  /*
   * Keep DynamoDB membership in sync.
   */
  await dynamodb.send(
    new UpdateItemCommand({
      TableName:
        TABLE_NAME,

      Key: marshall({
        PK:
          `WORKSPACE#${workspace.workspaceId}`,

        SK:
          `MEMBER#${targetUserId}`,
      }),

      UpdateExpression:
        'SET #role = :role',

      ExpressionAttributeNames: {
        '#role': 'role',
      },

      ExpressionAttributeValues:
        marshall({
          ':role': newRole,
        }),
    }),
  );

  await createActivity(
    workspace.workspaceId,
    userId,
    'ROLE_CHANGED',
    targetUserId,
    `Changed ${member.email}'s role to ${newRole}`,
  );

  return response(200, {
    message:
      'Role updated successfully.',

    userId:
      targetUserId,

    role:
      newRole,
  });
}

/* =========================================================
   INVITE USER
========================================================= */

async function inviteUser(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } = await getEffectiveRole(event);

  if (!canChangeRole(role)) {
    return response(403, {
      message: 'You do not have permission to invite users.',
    });
  }

  let body: Record<string, unknown>;

  try {
    body = parseBody(event);
  } catch {
    return response(400, {
      message: 'Invalid JSON.',
    });
  }

  const inviteEmail =
    typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : '';

  const inviteRole =
    typeof body.role === 'string'
      ? (body.role.toUpperCase() as Role)
      : 'EMPLOYEE';

  const inviteName =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : inviteEmail.split('@')[0];

  if (!inviteEmail || !inviteEmail.includes('@')) {
    return response(400, {
      message: 'Valid email is required.',
    });
  }

  if (!['ADMIN', 'MANAGER', 'EMPLOYEE'].includes(inviteRole)) {
    return response(400, {
      message: 'Invalid role. Role must be ADMIN, MANAGER, or EMPLOYEE.',
    });
  }

  const groupName =
    inviteRole === 'ADMIN'
      ? 'Admin'
      : inviteRole === 'MANAGER'
        ? 'Manager'
        : 'Employee';

  let newUserSub: string;

  try {
    const createResult = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: inviteEmail,
        UserAttributes: [
          { Name: 'email', Value: inviteEmail },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: inviteName },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );

    newUserSub = createResult.User?.Username || inviteEmail;
  } catch (error: any) {
    if (error.name === 'UsernameExistsException') {
      return response(400, {
        message: 'A user with this email already exists.',
      });
    }

    console.error('Failed to create user in Cognito:', error);
    return response(500, {
      message: error.message || 'Failed to invite user.',
    });
  }

  try {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: newUserSub,
        GroupName: groupName,
      }),
    );
  } catch (error) {
    console.error('Failed to add user to Cognito group:', error);
  }

  const timestamp = now();

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        PK: `WORKSPACE#${workspace.workspaceId}`,
        SK: `MEMBER#${newUserSub}`,
        GSI1PK: `USER#${newUserSub}`,
        GSI1SK: `WORKSPACE#${workspace.workspaceId}`,
        entityType: 'MEMBER',
        userId: newUserSub,
        email: inviteEmail,
        name: inviteName,
        role: inviteRole,
        isOwner: false,
        joinedAt: timestamp,
      }),
    }),
  );

  await createActivity(
    workspace.workspaceId,
    userId,
    'USER_INVITED',
    newUserSub,
    `Invited ${inviteEmail} as ${inviteRole}`,
  );

  return response(201, {
    message: 'User invited successfully.',
    user: {
      userId: newUserSub,
      email: inviteEmail,
      name: inviteName,
      role: inviteRole,
    },
  });
}

/* =========================================================
   DELETE USER
========================================================= */

async function deleteUser(
  event: APIGatewayProxyEventV2,
  targetUserId: string,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } = await getEffectiveRole(event);

  if (!canChangeRole(role)) {
    return response(403, {
      message: 'You do not have permission to delete users.',
    });
  }

  if (targetUserId === userId) {
    return response(400, {
      message: 'You cannot delete yourself.',
    });
  }

  const existing = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `WORKSPACE#${workspace.workspaceId}`,
        SK: `MEMBER#${targetUserId}`,
      }),
    }),
  );

  if (!existing.Item) {
    return response(404, {
      message: 'User is not a member of this workspace.',
    });
  }

  const member = unmarshall(existing.Item);

  if (member.isOwner === true) {
    return response(400, {
      message: 'The workspace owner cannot be deleted.',
    });
  }

  // Delete workspace membership in DynamoDB
  await dynamodb.send(
    new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `WORKSPACE#${workspace.workspaceId}`,
        SK: `MEMBER#${targetUserId}`,
      }),
    }),
  );

  // Delete from Cognito User Pool
  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetUserId,
      }),
    );
  } catch (error) {
    console.error('Unable to delete Cognito user:', error);
  }

  await createActivity(
    workspace.workspaceId,
    userId,
    'USER_DELETED',
    targetUserId,
    `Deleted user ${member.email || targetUserId}`,
  );

  return response(200, {
    message: 'User deleted successfully.',
    userId: targetUserId,
  });
}

/* =========================================================
   ACTIVITY
========================================================= */

async function createActivity(
  workspaceId: string,
  actorId: string,
  action: string,
  targetId: string,
  description: string,
) {
  const timestamp = now();

  await dynamodb.send(
    new PutItemCommand({
      TableName:
        TABLE_NAME,

      Item: marshall({
        PK:
          `WORKSPACE#${workspaceId}`,

        SK:
          `ACTIVITY#${timestamp}#${newId()}`,

        entityType:
          'ACTIVITY',

        workspaceId,
        actorId,
        action,
        targetId,
        description,

        createdAt:
          timestamp,
      }),
    }),
  );
}

async function getActivity(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace } =
    await getEffectiveRole(event);

  const result =
    await dynamodb.send(
      new QueryCommand({
        TableName:
          TABLE_NAME,

        KeyConditionExpression:
          'PK = :pk AND begins_with(SK, :sk)',

        ExpressionAttributeValues:
          marshall({
            ':pk':
              `WORKSPACE#${workspace.workspaceId}`,

            ':sk':
              'ACTIVITY#',
          }),

        ScanIndexForward: false,

        Limit: 20,
      }),
    );

  return response(200, {
    activities:
      (result.Items ?? []).map(
        (item) =>
          unmarshall(item),
      ),
  });
}

/* =========================================================
   DASHBOARD
========================================================= */

async function getDashboard(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserId(event);
  const email = getEmail(event);

  if (!userId || !email) {
    return response(401, {
      message: 'Unauthorized.',
    });
  }

  const { workspace, role } =
    await getEffectiveRole(event);

  const result =
    await dynamodb.send(
      new QueryCommand({
        TableName:
          TABLE_NAME,

        KeyConditionExpression:
          'PK = :pk AND begins_with(SK, :sk)',

        ExpressionAttributeValues:
          marshall({
            ':pk':
              `WORKSPACE#${workspace.workspaceId}`,

            ':sk':
              'PROJECT#',
          }),
      }),
    );

  const projects =
    (result.Items ?? []).map(
      (item) =>
        unmarshall(item),
    );

  const teamResult =
    await dynamodb.send(
      new QueryCommand({
        TableName:
          TABLE_NAME,

        KeyConditionExpression:
          'PK = :pk',

        ExpressionAttributeValues:
          marshall({
            ':pk':
              `WORKSPACE#${workspace.workspaceId}`,
          }),
      }),
    );

  const members =
    (teamResult.Items ?? [])
      .map((item) =>
        unmarshall(item),
      )
      .filter(
        (item) =>
          item.entityType ===
          'MEMBER',
      );

  const sortedProjects =
    [...projects].sort(
      (a, b) =>
        new Date(
          b.updatedAt,
        ).getTime() -
        new Date(
          a.updatedAt,
        ).getTime(),
        );

    return response(200, {
      workspace,
      role,
      projects: sortedProjects,
      members,
    });
  }

  export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  try {
    if (method === 'GET' && path === '/me') {
      return await getMe(event);
    }

    if (method === 'GET' && path === '/dashboard') {
      return await getDashboard(event);
    }

    if (method === 'GET' && path === '/projects') {
      return await getProjects(event);
    }

    if (method === 'POST' && path === '/projects') {
      return await createProject(event);
    }

    if (
      method === 'PUT' &&
      path.startsWith('/projects/')
    ) {
      const projectId = path.slice('/projects/'.length);
      return await updateProject(event, projectId);
    }

    if (
      method === 'DELETE' &&
      path.startsWith('/projects/')
    ) {
      const projectId = path.slice('/projects/'.length);
      return await deleteProject(event, projectId);
    }

    if (method === 'GET' && path === '/team') {
      return await getTeam(event);
    }

    if (method === 'POST' && path === '/team') {
      return await inviteUser(event);
    }

    if (
      method === 'DELETE' &&
      path.startsWith('/team/') &&
      !path.endsWith('/role')
    ) {
      const targetUserId = path.slice('/team/'.length);
      return await deleteUser(event, targetUserId);
    }

    if (
      method === 'PUT' &&
      path.startsWith('/team/') &&
      path.endsWith('/role')
    ) {
      const targetUserId = path.slice('/team/'.length, path.length - '/role'.length);
      return await changeUserRole(event, targetUserId);
    }

    if (method === 'GET' && path === '/activity') {
      return await getActivity(event);
    }

    return response(404, {
      message: 'Route not found.',
    });
  } catch (error) {
    console.error('Unhandled Lambda error:', error);

    return response(500, {
      message: 'Internal server error.',
    });
  }
}