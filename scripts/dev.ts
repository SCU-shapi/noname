import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [];

function managedSpawn(command: string, label: string): ChildProcess {
	const child = spawn(command, {
		shell: true,
		stdio: "inherit",
	});
	child.on("exit", (code, signal) => {
		if (code !== 0 && code !== null) {
			console.error(`⚠ [${label}] 异常退出，code: ${code}, signal: ${signal}`);
		}
	});
	children.push(child);
	return child;
}

const fsDev = managedSpawn("pnpm -F @noname/fs dev --debug --dirname=../../apps/core", "fs");
const extWatch = managedSpawn("pnpm -F ./packages/extension/** build:watch", "extension:watch");
const coreDev = managedSpawn("pnpm -F noname dev --open", "core");

function cleanup(): void {
	console.log("\n🛑 正在终止所有子进程...");
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
		}
	}
	// 强制清理 3 秒后仍存活的进程
	setTimeout(() => {
		for (const child of children) {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGKILL");
			}
		}
		process.exit(0);
	}, 3000);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", () => {
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
	}
});
