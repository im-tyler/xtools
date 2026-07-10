import { load, initSync, subscribe, getState } from "./store.js";
import { render, maybeAutoLearn } from "./ui.js";

async function main() {
  initSync();
  await load();
  subscribe(render);
  render(getState());
  maybeAutoLearn();
}

main();
