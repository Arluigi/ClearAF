// Legacy development utilities must never recreate publicly documented credentials.
const configured = process.env.CLEARAF_DEVELOPMENT_PASSWORD;
if (!configured || configured.length < 20) {
  throw new Error('Set CLEARAF_DEVELOPMENT_PASSWORD to a unique password of at least 20 characters before using a development account utility.');
}
export const developmentPassword: string = configured;
