/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import {
	CONFIG_DIR_NAME,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { formatMessagePrefix, formatPromptLine, resolveTimeZone, type ResolvedTimeZone } from "./src/clock.ts";
import {
	defaultTimeAwarenessConfig,
	loadTimeAwarenessConfig,
	type TimeAwarenessConfig,
} from "./src/config.ts";
import { prefixUserMessages } from "./src/inject.ts";

/** Name of the system-prompt section that carries the current time. */
const NOW_SECTION = "current_time";

/** Reports a configuration or setup problem without disturbing the agent turn. */
function warn(message: string): void {
	console.warn(`time-awareness: ${message}`);
}

/** Reports a setting that has a silent failure mode when it is wrong. */
function note(message: string): void {
	console.info(`time-awareness: ${message}`);
}

/** Formats an unknown thrown value for a warning. */
function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Registers time awareness with Pi.
 *
 * Two independent pieces of behaviour: every user message reaching the model
 * through `context` carries the local time it was sent, and, when `nowLine` is
 * on, the system prompt names the time of the request itself.
 */
export default function timeAwarenessExtension(pi: ExtensionAPI): void {
	let config: TimeAwarenessConfig = defaultTimeAwarenessConfig();
	let zone: ResolvedTimeZone = resolveTimeZone(undefined);

	/** Formats a message timestamp in the zone currently in force. */
	const prefixFor = (atMs: number): string => formatMessagePrefix(atMs, zone.timeZone);

	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		const loaded = loadTimeAwarenessConfig({
			agentDir: getAgentDir(),
			configDirName: CONFIG_DIR_NAME,
			cwd: ctx.cwd,
			projectTrusted: ctx.isProjectTrusted(),
		});
		config = loaded.config;
		for (const error of loaded.errors) warn(error);

		zone = resolveTimeZone(config.timeZone);
		// One line per session, because the zone is the one part of this
		// extension whose failure is silent: a wrong `TZ` produces confident,
		// wrong timestamps rather than an error.
		const origin = zone.raw === undefined ? zone.source : `${zone.source} ${zone.raw}`;
		note(`zone ${zone.timeZone} (${origin}), ${config.enabled ? "prefixing" : "disabled"}`);
	});

	pi.on("context", (event) => {
		if (!config.enabled) return;

		try {
			const messages = prefixUserMessages(event.messages, prefixFor);
			if (messages === event.messages) return;
			return { messages };
		} catch (error) {
			// A broken timestamp is not worth a failed turn.
			warn(`prefixing failed: ${describeError(error)}`);
			return;
		}
	});

	pi.on("before_agent_start", (event) => {
		if (!config.enabled || !config.nowLine) return;

		try {
			event.systemPromptOptions.sections[NOW_SECTION] = formatPromptLine(Date.now(), zone.timeZone);
		} catch (error) {
			warn(`now line failed: ${describeError(error)}`);
		}
	});
}
