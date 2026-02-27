import { getEnv, getRuntimeConfig } from './config/env.js';
import { createApp } from './app.js';

const env = getEnv();
const app = createApp({ config: getRuntimeConfig(env) });

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`TaxAlpha backend running on http://localhost:${env.PORT}`);
});
