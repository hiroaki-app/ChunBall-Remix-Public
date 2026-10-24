import { preparePwa } from "./pwa";

async function start(): Promise<void> {
  await preparePwa();
  await import("./main");
}
void start();
