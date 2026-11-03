/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";

/**
 * Matches text that already carries a generated prefix.
 *
 * The transform is idempotent by construction — the prefix is derived from the
 * message's own timestamp, so replaying it produces the same string — but the
 * check is cheap and it protects against a second copy of this extension, or a
 * future one that writes the same shape, running beside this one.
 */
export const TIMESTAMP_PREFIX_PATTERN = /^\[[A-Z][a-z]{2} \d{4}-\d{2}-\d{2} \d{2}:\d{2} [^\]\n]{1,40}\] /;

/** Formats the prefix for one message timestamp. */
export type PrefixFormatter = (atMs: number) => string;

/** Whether a value is a text content block. */
function isTextPart(part: unknown): part is { type: "text"; text: string } {
	if (typeof part !== "object" || part === null) return false;
	const candidate = part as { type?: unknown; text?: unknown };
	return candidate.type === "text" && typeof candidate.text === "string";
}

/** Reads a message field without narrowing the agent message union. */
function fieldOf(message: unknown, key: string): unknown {
	if (typeof message !== "object" || message === null) return undefined;
	return (message as Record<string, unknown>)[key];
}

/**
 * Returns content with the prefix on its first text block.
 *
 * An image-only message is returned unchanged rather than having a text block
 * grafted into it: a timestamp attached to nothing in particular reads to the
 * model as though the user had typed it.
 */
function prefixContent(content: unknown, prefix: string): unknown | undefined {
	if (typeof content === "string") {
		if (content === "" || TIMESTAMP_PREFIX_PATTERN.test(content)) return undefined;
		return `${prefix}${content}`;
	}

	if (!Array.isArray(content)) return undefined;

	const blocks: unknown[] = content;
	const index = blocks.findIndex(isTextPart);
	if (index < 0) return undefined;

	const part = blocks[index];
	if (!isTextPart(part) || part.text === "" || TIMESTAMP_PREFIX_PATTERN.test(part.text)) return undefined;

	const next = blocks.slice();
	next[index] = { ...part, text: `${prefix}${part.text}` };
	return next;
}

/**
 * Returns the conversation with every user message carrying its send time.
 *
 * Only real user messages are touched. `bashExecution`, `custom` and the
 * summary frames also reach the provider as user turns, but they are the
 * harness speaking, not the person, and a timestamp in front of them would
 * claim otherwise.
 *
 * The input is never mutated, and the same array is returned when nothing
 * changed, so the caller can compare identity instead of deep-comparing
 * transcripts on every request.
 */
export function prefixUserMessages(
	messages: readonly AgentMessage[],
	format: PrefixFormatter,
): AgentMessage[] {
	let changed = false;

	const next = messages.map((message) => {
		if (fieldOf(message, "role") !== "user") return message;

		const atMs = fieldOf(message, "timestamp");
		if (typeof atMs !== "number" || !Number.isFinite(atMs)) return message;

		const prefix = format(atMs);
		if (prefix === "") return message;

		const prefixed = prefixContent(fieldOf(message, "content"), prefix);
		if (prefixed === undefined) return message;

		changed = true;
		return { ...(message as Record<string, unknown>), content: prefixed } as unknown as AgentMessage;
	});

	return changed ? next : (messages as AgentMessage[]);
}
