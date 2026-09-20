import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import {
  AttributeType,
  BillingMode,
  Table,
} from 'aws-cdk-lib/aws-dynamodb';

import {
  UserPool,
  CfnUserPoolGroup,
  AccountRecovery,
} from 'aws-cdk-lib/aws-cognito';

import { Function, Code, Runtime } from 'aws-cdk-lib/aws-lambda';

import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';

import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';

import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import * as path from 'path';

export class TeamGateStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: cdk.StackProps,
  ) {
    super(scope, id, props);

    /* ---------------------------------------------
       DynamoDB
    --------------------------------------------- */

    const table = new Table(this, 'TeamGateTable', {
      partitionKey: {
        name: 'PK',
        type: AttributeType.STRING,
      },

      sortKey: {
        name: 'SK',
        type: AttributeType.STRING,
      },

      billingMode: BillingMode.PAY_PER_REQUEST,

      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',

      partitionKey: {
        name: 'GSI1PK',
        type: AttributeType.STRING,
      },

      sortKey: {
        name: 'GSI1SK',
        type: AttributeType.STRING,
      },
    });

    /* ---------------------------------------------
       Cognito
    --------------------------------------------- */

    const userPool = new UserPool(
      this,
      'TeamGateUserPool',
      {
        userPoolName: 'teamgate-user-pool',

        selfSignUpEnabled: false,

        signInAliases: {
          email: true,
        },

        autoVerify: {
          email: true,
        },

        accountRecovery:
          AccountRecovery.EMAIL_ONLY,

        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: false,
        },

        userInvitation: {
          emailSubject: 'Welcome to TeamGate — Your account is ready',
          emailBody: 'Hello,\n\nYou have been invited to join TeamGate.\n\nYour login details\nUsername: {username}\nTemporary password: {####}\n\nSign in to TeamGate\nhttps://teamgate-v2-mu.vercel.app/\n\nWhen you sign in for the first time, you will be asked to create your own permanent password.\n\nRegards,\nTeamGate Team',
        },

        removalPolicy:
          cdk.RemovalPolicy.DESTROY,
      },
    );

    const userPoolClient =
      userPool.addClient(
        'TeamGateClient',
        {
          authFlows: {
            userSrp: true,
            userPassword: true,
          },
        },
      );

    /* ---------------------------------------------
       Cognito groups
    --------------------------------------------- */

    new CfnUserPoolGroup(
      this,
      'AdminGroup',
      {
        userPoolId:
          userPool.userPoolId,

        groupName: 'Admin',

        description:
          'Workspace administration and project management',
      },
    );

    new CfnUserPoolGroup(
      this,
      'ManagerGroup',
      {
        userPoolId:
          userPool.userPoolId,

        groupName: 'Manager',

        description:
          'Project creation and editing',
      },
    );

    new CfnUserPoolGroup(
      this,
      'EmployeeGroup',
      {
        userPoolId:
          userPool.userPoolId,

        groupName: 'Employee',

        description:
          'Read-only project access',
      },
    );

    /* ---------------------------------------------
       Secrets Manager (Bootstrap Admin Secret)
    --------------------------------------------- */

    const adminSecret = new secretsmanager.Secret(this, 'TeamGateAdminSecret', {
      secretName: 'teamgate/bootstrap-admin',
      description: 'Bootstrap admin credentials for TeamGate',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ email: 'teamgate@gmail.com' }),
        generateStringKey: 'password',
        passwordLength: 16,
        excludePunctuation: true,
      },
    });

    /* ---------------------------------------------
       Lambda
    --------------------------------------------- */

    const apiFn = new Function(this, 'TeamGateApiFn', {
      runtime: Runtime.PYTHON_3_12,
      code: Code.fromAsset(path.join(__dirname, '../lambda')),
      handler: 'handler.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        DEFAULT_ADMIN_EMAIL: 'teamgate@gmail.com',
        BOOTSTRAP_ADMIN_SECRET_ARN: adminSecret.secretArn,
      },
    });

    adminSecret.grantRead(apiFn);

    /* ---------------------------------------------
       DynamoDB permission
    --------------------------------------------- */

    table.grantReadWriteData(apiFn);

    /* ---------------------------------------------
       Cognito permissions
    --------------------------------------------- */

    apiFn.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:AdminRemoveUserFromGroup',
          'cognito-idp:AdminListGroupsForUser',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:ListUsers',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminDeleteUser',
        ],

        resources: [
          userPool.userPoolArn,
        ],
      }),
    );

    /* ---------------------------------------------
       JWT Authorizer
    --------------------------------------------- */

    const authorizer =
      new HttpJwtAuthorizer(
        'CognitoAuthorizer',

        `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,

        {
          jwtAudience: [
            userPoolClient.userPoolClientId,
          ],
        },
      );

    /* ---------------------------------------------
       API integration
    --------------------------------------------- */

    const integration =
      new HttpLambdaIntegration(
        'ApiIntegration',
        apiFn,
      );

    /* ---------------------------------------------
       HTTP API
    --------------------------------------------- */

    const httpApi =
      new HttpApi(
        this,
        'TeamGateHttpApi',
        {
          apiName: 'teamgate-api',

          corsPreflight: {
            allowHeaders: [
              'Authorization',
              'Content-Type',
            ],

            allowMethods: [
              CorsHttpMethod.GET,
              CorsHttpMethod.POST,
              CorsHttpMethod.PUT,
              CorsHttpMethod.DELETE,
              CorsHttpMethod.OPTIONS,
            ],

            allowOrigins: ['*'],
          },
        },
      );

    /* ---------------------------------------------
       Routes
    --------------------------------------------- */

    httpApi.addRoutes({
      path: '/me',

      methods: [
        HttpMethod.GET,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/dashboard',

      methods: [
        HttpMethod.GET,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/projects',

      methods: [
        HttpMethod.GET,
        HttpMethod.POST,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/projects/{id}',

      methods: [
        HttpMethod.PUT,
        HttpMethod.DELETE,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/team',

      methods: [
        HttpMethod.GET,
        HttpMethod.POST,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/team/{id}',

      methods: [
        HttpMethod.DELETE,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/team/{id}/role',

      methods: [
        HttpMethod.PUT,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/activity',

      methods: [
        HttpMethod.GET,
      ],

      integration,

      authorizer,
    });

    httpApi.addRoutes({
      path: '/invitations/{token}',

      methods: [
        HttpMethod.GET,
      ],

      integration,
    });

    httpApi.addRoutes({
      path: '/invitations/accept',

      methods: [
        HttpMethod.POST,
      ],

      integration,

      authorizer,
    });

    /* ---------------------------------------------
       Outputs
    --------------------------------------------- */

    new cdk.CfnOutput(
      this,
      'ApiUrl',
      {
        value:
          httpApi.apiEndpoint,
      },
    );

    new cdk.CfnOutput(
      this,
      'UserPoolId',
      {
        value:
          userPool.userPoolId,
      },
    );

    new cdk.CfnOutput(
      this,
      'UserPoolClientId',
      {
        value:
          userPoolClient.userPoolClientId,
      },
    );

    new cdk.CfnOutput(
      this,
      'TableName',
      {
        value:
          table.tableName,
      },
    );
  }
}
