/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { prefixUserMessages, TIMESTAMP_PREFIX_PATTERN } from "../src/inject.ts";

/** A fixed prefix so the assertions are about placement, not about zone data. */
const format = (atMs: number): string => `[T${String(atMs)}] `;

/** Wraps loosely-typed fixtures, since the agent message union is wider than a test needs. */
function asMessages(...messages: unknown[]): AgentMessage[] {
	return messages as unknown as AgentMessage[];
}

/** Reads a message back without narrowing the union. */
function read(message: AgentMessage): Record<string, unknown> {
	return message as unknown as Record<string, unknown>;
}

test("a string-content user message is prefixed", () => {
	const messages = asMessages({ role: "user", content: "hello", timestamp: 1 });
	const out = prefixUserMessages(messages, format);
	assert.equal(read(out[0] as AgentMessage).content, "[T1] hello");
});

test("array-content user messages are prefixed on their first text block", () => {
	const messages = asMessages({
		role: "user",
		content: [
			{ type: "image", data: "…", mimeType: "image/png" },
			{ type: "text", text: "what is this" },
		],
		timestamp: 2,
	});
	const out = prefixUserMessages(messages, format);
	const content = read(out[0] as AgentMessage).content as { type: string; text?: string }[];
	assert.equal(content[0]?.type, "image");
	assert.equal(content[1]?.text, "[T2] what is this");
});

test("assistant, tool and harness-speaker messages are left alone", () => {
	const messages = asMessages(
		{ role: "assistant", content: [{ type: "text", text: "hi" }], timestamp: 3 },
		{ role: "toolResult", toolCallId: "x", toolName: "bash", content: [], timestamp: 4 },
		{ role: "bashExecution", command: "ls", output: "", timestamp: 5 },
		{ role: "custom", customType: "note", content: "remember", display: true, timestamp: 6 },
		{ role: "compactionSummary", summary: "…", tokensBefore: 1, timestamp: 7 },
	);
	const out = prefixUserMessages(messages, format);
	assert.equal(out, messages);
	assert.deepEqual(out.map((message) => read(message).content), messages.map((message) => read(message).content));
});

test("an image-only user message is not given a text block", () => {
	const messages = asMessages({
		role: "user",
		content: [{ type: "image", data: "…", mimeType: "image/png" }],
		timestamp: 8,
	});
	const out = prefixUserMessages(messages, format);
	assert.equal(out, messages);
});

test("a message without a usable timestamp is passed through", () => {
	const messages = asMessages(
		{ role: "user", content: "no timestamp" },
		{ role: "user", content: "bad timestamp", timestamp: "yesterday" },
	);
	assert.equal(prefixUserMessages(messages, format), messages);
});

test("an empty text block is not prefixed", () => {
	const messages = asMessages({ role: "user", content: [{ type: "text", text: "" }], timestamp: 9 });
	assert.equal(prefixUserMessages(messages, format), messages);
});

test("already-prefixed text is not prefixed twice", () => {
	const messages = asMessages({ role: "user", content: "[Mon 2026-11-02 16:31 EST] hello", timestamp: 10 });
	assert.equal(prefixUserMessages(messages, format), messages);
});

test("the prefix pattern matches what the formatter writes and nothing looser", () => {
	assert.ok(TIMESTAMP_PREFIX_PATTERN.test("[Mon 2026-11-02 16:31 EST] hello"));
	assert.ok(TIMESTAMP_PREFIX_PATTERN.test("[Tue 2026-07-15 00:05 GMT+2] hello"));
	assert.ok(!TIMESTAMP_PREFIX_PATTERN.test("[not a timestamp] hello"));
	assert.ok(!TIMESTAMP_PREFIX_PATTERN.test("please quote [Mon 2026-11-02 16:31 EST] back to me"));
});

test("the input is never mutated", () => {
	const original = {
		role: "user",
		content: [{ type: "text", text: "hello" }],
		timestamp: 11,
	};
	const snapshot = structuredClone(original);
	const messages = asMessages(original);
	prefixUserMessages(messages, format);
	assert.deepEqual(original, snapshot);
});

test("every user message is prefixed, and only the changed ones are rebuilt", () => {
	const first = { role: "user", content: "one", timestamp: 12 };
	const assistant = { role: "assistant", content: [{ type: "text", text: "two" }], timestamp: 13 };
	const second = { role: "user", content: "three", timestamp: 14 };
	const messages = asMessages(first, assistant, second);

	const out = prefixUserMessages(messages, format);

	assert.equal(out.length, 3);
	assert.notEqual(out, messages);
	assert.equal(read(out[0] as AgentMessage).content, "[T12] one");
	assert.equal(out[1], assistant);
	assert.equal(read(out[2] as AgentMessage).content, "[T14] three");
});

test("a formatter that declines to format leaves the transcript untouched", () => {
	const messages = asMessages({ role: "user", content: "hello", timestamp: 15 });
	assert.equal(prefixUserMessages(messages, () => ""), messages);
});
