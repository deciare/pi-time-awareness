/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Effective time-awareness configuration. */
export interface TimeAwarenessConfig {
	/** Whether user messages are prefixed at all. Defaults to true. */
	enabled: boolean;
	/**
	 * Zone used for the prefixes: `auto` follows the container (`TZ`, then
	 * `/etc/localtime`, then UTC), and any other value is an IANA zone name.
	 */
	timeZone: string;
	/** Also name the current time in a `current_time` system-prompt section. Defaults to false. */
	nowLine: boolean;
}

/** Files consulted while loading configuration. */
export interface TimeAwarenessConfigLoad {
	config: TimeAwarenessConfig;
	errors: string[];
	paths: string[];
}

/** Options needed to locate global and trusted project configuration. */
export interface LoadTimeAwarenessConfigOptions {
	agentDir: string;
	configDirName: string;
	cwd: string;
	projectTrusted: boolean;
}

type ConfigFileValues = Partial<TimeAwarenessConfig>;

/** File name used in Pi's agent directory and in a trusted project's config directory. */
export const CONFIG_FILENAME = "pi-time-awareness.json";

/** The `timeZone` value that defers to the container. */
export const AUTO_TIME_ZONE = "auto";

const CONFIG_KEYS = new Set(["enabled", "timeZone", "nowLine"]);

/** Configuration used when no file exists. */
export function defaultTimeAwarenessConfig(): TimeAwarenessConfig {
	return { enabled: true, timeZone: AUTO_TIME_ZONE, nowLine: false };
}

/** Whether an IANA zone name is one this runtime can actually format with. */
export function isValidTimeZone(value: string): boolean {
	if (value === "") return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** Whether a JSON value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Removes a UTF-8 byte-order mark before parsing a JSON file. */
function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parses and validates one configuration file into partial effective values. */
function parseConfigFile(configPath: string): { values?: ConfigFileValues; error?: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripBom(readFileSync(configPath, "utf8")));
	} catch (error) {
		return {
			error: `${configPath}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	if (!isRecord(parsed)) {
		return { error: `${configPath}: expected a JSON object` };
	}

	const unknownKeys = Object.keys(parsed).filter((key) => !CONFIG_KEYS.has(key));
	if (unknownKeys.length > 0) {
		return {
			error: `${configPath}: unknown ${unknownKeys.length === 1 ? "key" : "keys"}: ${unknownKeys.join(", ")}`,
		};
	}

	const values: ConfigFileValues = {};

	if (parsed.enabled !== undefined) {
		if (typeof parsed.enabled !== "boolean") {
			return { error: `${configPath}: enabled must be true or false` };
		}
		values.enabled = parsed.enabled;
	}

	if (parsed.nowLine !== undefined) {
		if (typeof parsed.nowLine !== "boolean") {
			return { error: `${configPath}: nowLine must be true or false` };
		}
		values.nowLine = parsed.nowLine;
	}

	if (parsed.timeZone !== undefined) {
		if (typeof parsed.timeZone !== "string" || parsed.timeZone.length === 0) {
			return { error: `${configPath}: timeZone must be a non-empty string` };
		}
		if (parsed.timeZone !== AUTO_TIME_ZONE && !isValidTimeZone(parsed.timeZone)) {
			return { error: `${configPath}: timeZone is not a known zone: ${parsed.timeZone}` };
		}
		values.timeZone = parsed.timeZone;
	}

	return { values };
}

/** Merges a valid file into the accumulated values. Invalid files are ignored in full. */
function mergeConfigFile(values: ConfigFileValues, configPath: string, errors: string[]): ConfigFileValues {
	if (!existsSync(configPath)) return values;

	const parsed = parseConfigFile(configPath);
	if (parsed.error !== undefined) {
		errors.push(parsed.error);
		return values;
	}
	return { ...values, ...parsed.values };
}

/**
 * Loads mergeable values from `pi-time-awareness.json` in Pi's agent directory
 * and, when trust is active, from the project's Pi configuration directory.
 *
 * A missing file is normal: the defaults are usable as they stand, so mounting
 * the extension with `TZ` set on the container is enough to have it work.
 */
export function loadTimeAwarenessConfig(options: LoadTimeAwarenessConfigOptions): TimeAwarenessConfigLoad {
	const globalPath = resolve(options.agentDir, CONFIG_FILENAME);
	const projectPath = resolve(options.cwd, options.configDirName, CONFIG_FILENAME);
	const paths = [globalPath];
	if (options.projectTrusted) paths.push(projectPath);

	const errors: string[] = [];
	let values: ConfigFileValues = {};
	values = mergeConfigFile(values, globalPath, errors);
	if (options.projectTrusted) {
		values = mergeConfigFile(values, projectPath, errors);
	}

	return {
		config: { ...defaultTimeAwarenessConfig(), ...values },
		errors,
		paths,
	};
}
