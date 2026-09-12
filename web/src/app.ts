import * as store from "./store.js";
import { mountListView } from "./ui/list-view.js";

async function main(): Promise<void> {
  await store.init();
  const root = document.getElementById("app");
  if (!root) throw new Error("missing #app root element");
  mountListView(root);
}

void main();
