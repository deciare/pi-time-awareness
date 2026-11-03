/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import timeAwareness from "../index.ts";

/** 2026-11-02T21:31:00Z, which is 16:31 EST. */
const NOVEMBER = Date.UTC(2026, 10, 2, 21, 31);

/** A registered handler, keyed by the event it answers. */
type Handlers = Map<string, (event: unknown, ctx: unknown) => unknown>;

/** Stands in for the extension API, capturing what the extension registers. */
function fakeApi(): { api: ExtensionAPI; handlers: Handlers } {
	const handlers: Handlers = new Map();
	const api = {
		on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => {
			handlers.set(event, handler);
			return () => handlers.delete(event);
		},
	} as unknown as ExtensionAPI;
	return { api, handlers };
}

/** Stands in for the session context the extension actually reads. */
function fakeContext(cwd: string): ExtensionContext {
	return { cwd, isProjectTrusted: () => false } as unknown as ExtensionContext;
}

/** Reads a message back without narrowing the union. */
function content(message: AgentMessage): unknown {
	return (message as unknown as Record<string, unknown>).content;
}

/** Runs the extension against a temporary agent directory holding one config file. */
function withConfig(body: Record<string, unknown>, run: (handlers: Handlers, root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pi-time-awareness-ext-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousInfo = console.info;
	process.env.PI_CODING_AGENT_DIR = root;
	console.info = () => {};
	try {
		writeFileSync(join(root, "pi-time-awareness.json"), JSON.stringify(body), "utf8");
		const { api, handlers } = fakeApi();
		timeAwareness(api);
		handlers.get("session_start")?.({ type: "session_start" }, fakeContext(root));
		run(handlers, root);
	} finally {
		console.info = previousInfo;
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		rmSync(root, { recursive: true, force: true });
	}
}

test("the context hook prefixes user messages in the configured zone", () => {
	withConfig({ timeZone: "America/New_York" }, (handlers) => {
		const messages = [{ role: "user", content: "hello", timestamp: NOVEMBER }] as unknown as AgentMessage[];
		const result = handlers.get("context")?.({ type: "context", messages }, undefined) as
			| { messages: AgentMessage[] }
			| undefined;
		assert.equal(content(result?.messages[0] as AgentMessage), "[Mon 2026-11-02 16:31 EST] hello");
	});
});

test("the context hook returns nothing when there is nothing to prefix", () => {
	withConfig({ timeZone: "America/New_York" }, (handlers) => {
		const messages = [{ role: "assistant", content: "hi", timestamp: NOVEMBER }] as unknown as AgentMessage[];
		assert.equal(handlers.get("context")?.({ type: "context", messages }, undefined), undefined);
	});
});

test("disabling the extension leaves the conversation alone", () => {
	withConfig({ enabled: false, timeZone: "America/New_York" }, (handlers) => {
		const messages = [{ role: "user", content: "hello", timestamp: NOVEMBER }] as unknown as AgentMessage[];
		assert.equal(handlers.get("context")?.({ type: "context", messages }, undefined), undefined);
	});
});

test("the current-time section appears only when asked for", () => {
	withConfig({ timeZone: "America/New_York" }, (handlers) => {
		const options = { sections: {} as Record<string, string> };
		handlers.get("before_agent_start")?.({ systemPromptOptions: options }, undefined);
		assert.equal(options.sections["current_time"], undefined);
	});

	withConfig({ timeZone: "America/New_York", nowLine: true }, (handlers) => {
		const options = { sections: {} as Record<string, string> };
		handlers.get("before_agent_start")?.({ systemPromptOptions: options }, undefined);
		assert.match(options.sections["current_time"] ?? "", /^Now: \w{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2} .+ \(America\/New_York\)$/);
	});
});

test("a bad configuration is reported and the defaults still apply", () => {
	withConfig({ timeZone: "Mars/Olympus" }, (handlers, root) => {
		const warnings: string[] = [];
		const previousWarn = console.warn;
		console.warn = (message: string) => warnings.push(message);
		try {
			// Re-run session_start so the new file is read through the warn path.
			handlers.get("session_start")?.({ type: "session_start" }, fakeContext(root));
		} finally {
			console.warn = previousWarn;
		}
		assert.ok(warnings.some((message) => message.includes("not a known zone: Mars/Olympus")));

		const messages = [{ role: "user", content: "hello", timestamp: NOVEMBER }] as unknown as AgentMessage[];
		const result = handlers.get("context")?.({ type: "context", messages }, undefined) as
			| { messages: AgentMessage[] }
			| undefined;
		assert.match(String(content(result?.messages[0] as AgentMessage)), /^\[[A-Z][a-z]{2} \d{4}-\d{2}-\d{2} \d{2}:\d{2} .+\] hello$/);
	});
});
