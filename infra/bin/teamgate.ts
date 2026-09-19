#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TeamGateStack } from '../lib/teamgate-stack';

const app = new cdk.App();

new TeamGateStack(app, 'TeamGateStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // Region is locked to ap-south-1 per assignment constraints.
    // Do not change this without checking the assignment PDF first.
    region: 'ap-south-1',
  },
});
