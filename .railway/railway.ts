/**
 * SentFund hosted demo on Railway, as Infrastructure as Code: the documented replacement for
 * railway.json / railway.toml, which NEW services cannot use ("New services cannot opt into
 * Config as Code"; docs.railway.com/infrastructure-as-code and /infrastructure-as-code/reference,
 * checked 10 Nov 2026).
 *
 * OPTIONAL and NOT APPLIED. docs/HOSTING.md sets the same things up in the Railway dashboard,
 * click by click; this file records them in code. It was not validated with `railway config
 * plan` (that needs a Railway login, which this build machine does not have). If you use it, run
 * `railway config plan` first and compare with the dashboard; a service is managed either here
 * or in the dashboard, not both.
 *
 * Not expressible here per the reference (set in the dashboard): restart policy (On Failure),
 * "Wait for CI", backups. The build is the repository's Dockerfile (Railway uses a root
 * `Dockerfile` automatically) and the start command is its CMD (scripts/hosted-start.sh).
 * Secrets are `preserve()`: their values are pasted into Railway Variables only, never here.
 */
import { defineRailway, github, preserve, project, service, volume } from 'railway/iac';

export default defineRailway(() => {
  const data = volume('sentfund-data');
  const web = service('sentfund', {
    source: github('andreete/neargajian', { branch: 'release' }),
    healthcheck: '/api/health',
    healthcheckTimeout: 300,
    replicas: 1, // a service with a volume cannot have replicas
    volumeMounts: { '/data': data },
    domains: [{ domain: 'sentfund.my.id', port: 8080 }], // apex; www.sentfund.my.id if the DNS cannot point the apex (docs/HOSTING.md, step 5)
    env: {
      NODE_ENV: 'production',
      PORT: '8080',
      HOSTED_DEMO: 'true',
      HOSTED_READONLY: 'false',
      DEMO_MODE: 'true',
      NEAR_NETWORK: 'testnet',
      NEAR_RPC_URL: 'https://rpc.testnet.fastnear.com',
      APP_BASE_URL: 'https://sentfund.my.id',
      DATABASE_URL: 'file:/data/sentfund.sqlite',
      VAULT_CONTRACT_ID: 'vault2.gajian-payroll.testnet',
      TUSDC_CONTRACT_ID: 'tusdc.gajian-payroll.testnet',
      MAKER_ACCOUNT_ID: 'maker.gajian-payroll.testnet',
      APPROVER1_ACCOUNT_ID: 'approver1.gajian-payroll.testnet',
      APPROVER2_ACCOUNT_ID: 'approver2.gajian-payroll.testnet',
      WORKER_ACCOUNT_ID: 'worker.gajian-payroll.testnet',
      ADMIN_SIGNER_ACCOUNT_ID: 'admin.gajian-payroll.testnet',
      ASSISTANT_MODEL: 'claude-opus-5-5',
      // Values set only in the Railway dashboard (docs/HOSTING.md, step 4). Never ADMIN_SIGNER_PRIVATE_KEY.
      SESSION_SECRET: preserve(),
      MAKER_SIGNER_PRIVATE_KEY: preserve(),
      APPROVER1_SIGNER_PRIVATE_KEY: preserve(),
      APPROVER2_SIGNER_PRIVATE_KEY: preserve(),
      WORKER_SIGNER_PRIVATE_KEY: preserve(),
      ANTHROPIC_API_KEY: preserve(),
      DEMO_RESET_TOKEN: preserve(),
    },
  });
  return project('sentfund', { resources: [web, data] });
});
