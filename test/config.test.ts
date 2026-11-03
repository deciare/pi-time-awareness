/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { defaultTimeAwarenessConfig, loadTimeAwarenessConfig } from "../src/config.ts";

/** Creates a disposable test workspace. */
function workspace(): string {
	return mkdtempSync(join(tmpdir(), "pi-time-awareness-config-"));
}

/** Writes one configuration file into a workspace. */
function writeConfig(root: string, body: string, relative = "pi-time-awareness.json"): void {
	const path = join(root, relative);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, body, "utf8");
}

test("a missing configuration file leaves usable defaults", () => {
	const root = workspace();
	try {
		const loaded = loadTimeAwarenessConfig({
			agentDir: root,
			configDirName: ".pi",
			cwd: root,
			projectTrusted: false,
		});
		assert.deepEqual(loaded.config, defaultTimeAwarenessConfig());
		assert.equal(loaded.config.enabled, true);
		assert.equal(loaded.config.timeZone, "auto");
		assert.equal(loaded.config.nowLine, false);
		assert.deepEqual(loaded.errors, []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("values are read from the agent directory file", () => {
	const root = workspace();
	try {
		writeConfig(root, JSON.stringify({ enabled: false, timeZone: "Europe/Berlin", nowLine: true }));
		const loaded = loadTimeAwarenessConfig({
			agentDir: root,
			configDirName: ".pi",
			cwd: root,
			projectTrusted: false,
		});
		assert.deepEqual(loaded.config, { enabled: false, timeZone: "Europe/Berlin", nowLine: true });
		assert.deepEqual(loaded.errors, []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a trusted project file overrides the global one", () => {
	const root = workspace();
	try {
		writeConfig(root, JSON.stringify({ timeZone: "Europe/Berlin" }));
		writeConfig(root, JSON.stringify({ timeZone: "America/New_York" }), ".pi/pi-time-awareness.json");
		const trusted = loadTimeAwarenessConfig({
			agentDir: root,
			configDirName: ".pi",
			cwd: root,
			projectTrusted: true,
		});
		assert.equal(trusted.config.timeZone, "America/New_York");

		const untrusted = loadTimeAwarenessConfig({
			agentDir: root,
			configDirName: ".pi",
			cwd: root,
			projectTrusted: false,
		});
		assert.equal(untrusted.config.timeZone, "Europe/Berlin");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("an invalid file is reported and ignored in full", () => {
	const root = workspace();
	try {
		writeConfig(root, JSON.stringify({ timeZone: "Europe/Berlin", mystery: 1 }));
		const loaded = loadTimeAwarenessConfig({
			agentDir: root,
			configDirName: ".pi",
			cwd: root,
			projectTrusted: false,
		});
		assert.deepEqual(loaded.config, defaultTimeAwarenessConfig());
		assert.equal(loaded.errors.length, 1);
		assert.match(loaded.errors[0] ?? "", /unknown key: mystery/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a zone the runtime cannot format with is rejected at load time", () => {
	const root = workspace();
	try {
		writeConfig(root, JSON.stringify({ timeZone: "Mars/Olympus" }));
		const loaded = loadTimeAwarenessConfig({
			agentDir: root,
			configDirName: ".pi",
			cwd: root,
			projectTrusted: false,
		});
		assert.deepEqual(loaded.config, defaultTimeAwarenessConfig());
		assert.match(loaded.errors[0] ?? "", /not a known zone: Mars\/Olympus/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("malformed JSON is reported rather than thrown", () => {
	const root = workspace();
	try {
		writeConfig(root, "{ not json");
		const loaded = loadTimeAwarenessConfig({
			agentDir: root,
			configDirName: ".pi",
			cwd: root,
			projectTrusted: false,
		});
		assert.deepEqual(loaded.config, defaultTimeAwarenessConfig());
		assert.equal(loaded.errors.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
