"use strict";

const fs = require("node:fs");
const path = require("node:path");

const apkDirectory = path.resolve(__dirname, "..", "android", "app", "build", "outputs", "apk", "debug");
const defaultApk = path.join(apkDirectory, "app-debug.apk");
const namedApk = path.join(apkDirectory, "PiQueueBall.apk");

if (!fs.existsSync(defaultApk)) {
  throw new Error(`Debug APK was not found at ${defaultApk}`);
}

fs.rmSync(namedApk, { force: true });
fs.renameSync(defaultApk, namedApk);
console.log(`Created ${namedApk}`);
