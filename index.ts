/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatMessagePrefix, resolveTimeZone, type ResolvedTimeZone } from "./src/clock.ts";
import { defaultTimeAwarenessConfig, loadTimeAwarenessConfig } from "./src/config.ts";
import { prefixUserMessages } from "./src/inject.ts";

/** Reports a configuration or setup problem without disturbing the agent turn. */
function warn(message: string): void {
	console.warn(`time-awareness: ${message}`);
}

/** Reports a setting whose failure is silent when it is wrong. */
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
 * Every user message reaching the model through `context` carries the local time
 * it was sent. Whether the extension runs at all is Pi's decision, made by the
 * `settings.json` package list, so there is no setting of our own that repeats it.
 */
export default function timeAwarenessExtension(pi: ExtensionAPI): void {
	let zone: ResolvedTimeZone = resolveTimeZone(defaultTimeAwarenessConfig().timeZone);

	/** Formats a message timestamp in the zone currently in force. */
	const prefixFor = (atMs: number): string => formatMessagePrefix(atMs, zone.timeZone);

	pi.on("session_start", (_event, ctx: ExtensionContext) => {
		const loaded = loadTimeAwarenessConfig({
			agentDir: getAgentDir(),
			configDirName: CONFIG_DIR_NAME,
			cwd: ctx.cwd,
			projectTrusted: ctx.isProjectTrusted(),
		});
		for (const error of loaded.errors) warn(error);

		zone = resolveTimeZone(loaded.config.timeZone);
		// One line per session, because the zone is the one part of this
		// extension whose failure is silent: a wrong `TZ` produces confident,
		// wrong timestamps rather than an error.
		const origin = zone.raw === undefined ? zone.source : `${zone.source} ${zone.raw}`;
		note(`zone ${zone.timeZone} (${origin})`);
	});

	pi.on("context", (event) => {
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
}
