import { clearAll } from "./src/utils/dataStore";

async function globalTeardown() {
  await clearAll();
}

export default globalTeardown;
