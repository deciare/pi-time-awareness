/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import { AUTO_TIME_ZONE, isValidTimeZone } from "./config.ts";

/** Where the zone currently in force came from. */
export type TimeZoneSource = "config" | "env" | "local" | "fallback";

/** A zone name together with the reason it was chosen. */
export interface ResolvedTimeZone {
	timeZone: string;
	source: TimeZoneSource;
	/** The raw `TZ` value, when one was set. Kept for logs: `TZ=EST5EDT` resolves to `America/New_York`. */
	raw?: string;
}

const FALLBACK_TIME_ZONE = "UTC";

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A formatter for one zone, reused across calls because building one is the expensive part. */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
	const cached = formatters.get(timeZone);
	if (cached !== undefined) return cached;

	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZoneName: "short",
	});
	formatters.set(timeZone, formatter);
	return formatter;
}

/**
 * Resolves the zone the prefixes are written in.
 *
 * The chain is deliberate: an explicit configuration value wins, then whatever
 * the process was given in `TZ`, then the container's own local zone, then UTC.
 * `Intl` already folds `TZ` and `/etc/localtime` into one answer, so the middle
 * two steps differ only in what the log can honestly claim.
 */
export function resolveTimeZone(
	configured: string | undefined,
	env: Record<string, string | undefined> = process.env,
	localZone?: string,
): ResolvedTimeZone {
	const local = localZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone;
	const raw = typeof env.TZ === "string" && env.TZ !== "" ? env.TZ : undefined;

	if (configured !== undefined && configured !== "" && configured !== AUTO_TIME_ZONE) {
		if (isValidTimeZone(configured)) return { timeZone: configured, source: "config", ...(raw === undefined ? {} : { raw }) };
	}

	if (raw !== undefined && isValidTimeZone(local)) {
		return { timeZone: local, source: "env", raw };
	}

	if (isValidTimeZone(local)) return { timeZone: local, source: "local" };

	return { timeZone: FALLBACK_TIME_ZONE, source: "fallback", ...(raw === undefined ? {} : { raw }) };
}

/** One broken-out timestamp, ready to be assembled into either text form. */
interface TimeParts {
	weekday: string;
	date: string;
	clock: string;
	zone: string;
}

/** Splits a timestamp into the pieces both formats need. */
function timeParts(atMs: number, timeZone: string): TimeParts {
	const at = new Date(atMs);
	const parts = formatterFor(timeZone).formatToParts(at);
	const pick = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";

	return {
		weekday: pick("weekday"),
		date: `${pick("year")}-${pick("month")}-${pick("day")}`,
		clock: `${pick("hour")}:${pick("minute")}`,
		zone: pick("timeZoneName"),
	};
}

/**
 * Formats the prefix that is placed at the start of a user message.
 *
 * The shape is fixed — `[Mon 2026-11-02 16:31 EST] ` — because a prefix that
 * changes shape between messages is noise, and because this one reads as a
 * timestamp without a legend.
 */
export function formatMessagePrefix(atMs: number, timeZone: string): string {
	if (!Number.isFinite(atMs)) return "";
	const parts = timeParts(atMs, timeZone);
	return `[${parts.weekday} ${parts.date} ${parts.clock} ${parts.zone}] `;
}
