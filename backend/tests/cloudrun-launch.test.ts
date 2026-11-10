import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import path from 'node:path';
test('Cloud Run runtime manifest carries API billing validation inputs alongside the email hook',()=>{
 const script=path.resolve(__dirname,'../../scripts/cloudrun-config.sh');
 const result=spawnSync('bash',['-c','source "$1"; printf "%s\\n" "${CLOUDRUN_RUNTIME_NAMES[@]}"','manifest',script],{encoding:'utf8'});
 assert.equal(result.status,0);const names=new Set(result.stdout.trim().split('\n'));
 for(const key of ['BILLING_PROVIDER','BILLING_RETURN_ORIGIN','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_API_VERSION','SEND_EMAIL_HOOK_SECRET','PAUBOX_API_KEY'])assert(names.has(key),'Missing runtime name: '+key);
});
