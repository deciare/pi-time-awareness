/**
 * pi-time-awareness
 *
 * @license
 * Copyright 2026 deciare
 * SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import test from "node:test";
import { formatMessagePrefix, formatPromptLine, resolveTimeZone } from "../src/clock.ts";

/** 2026-11-02T21:31:00Z — after the northern DST change, so New York is on EST. */
const NOVEMBER = Date.UTC(2026, 10, 2, 21, 31);

/** 2026-07-15T04:05:00Z — mid-summer, and local midnight in New York. */
const JULY = Date.UTC(2026, 6, 15, 4, 5);

test("a configured zone wins over the environment", () => {
	const resolved = resolveTimeZone("Europe/Berlin", { TZ: "America/New_York" }, "UTC");
	assert.equal(resolved.timeZone, "Europe/Berlin");
	assert.equal(resolved.source, "config");
	assert.equal(resolved.raw, "America/New_York");
});

test("auto follows TZ", () => {
	const resolved = resolveTimeZone("auto", { TZ: "America/New_York" }, "America/New_York");
	assert.equal(resolved.timeZone, "America/New_York");
	assert.equal(resolved.source, "env");
	assert.equal(resolved.raw, "America/New_York");
});

test("a POSIX-style TZ is reported as what it normalises to", () => {
	const resolved = resolveTimeZone("auto", { TZ: "EST5EDT" }, "America/New_York");
	assert.equal(resolved.timeZone, "America/New_York");
	assert.equal(resolved.source, "env");
	assert.equal(resolved.raw, "EST5EDT");
});

test("auto without TZ uses the container's local zone", () => {
	const resolved = resolveTimeZone(undefined, {}, "Europe/Berlin");
	assert.equal(resolved.timeZone, "Europe/Berlin");
	assert.equal(resolved.source, "local");
	assert.equal(resolved.raw, undefined);
});

test("a runtime that reports no usable zone falls back to UTC", () => {
	const resolved = resolveTimeZone("auto", {}, "Not/AZone");
	assert.equal(resolved.timeZone, "UTC");
	assert.equal(resolved.source, "fallback");
});

test("the prefix uses the weekday, ISO date, 24-hour time and abbreviation", () => {
	assert.equal(formatMessagePrefix(NOVEMBER, "America/New_York"), "[Mon 2026-11-02 16:31 EST] ");
	assert.equal(formatMessagePrefix(NOVEMBER, "UTC"), "[Mon 2026-11-02 21:31 UTC] ");
});

test("midnight is 00, never 24", () => {
	assert.equal(formatMessagePrefix(JULY, "America/New_York"), "[Wed 2026-07-15 00:05 EDT] ");
});

test("the prompt line names the zone as well as its abbreviation", () => {
	assert.equal(formatPromptLine(NOVEMBER, "America/New_York"), "Now: Mon 2026-11-02 16:31 EST (America/New_York)");
});

test("a zone with no short abbreviation falls back to an offset, not a guess", () => {
	// en-US has abbreviations for North American zones and GMT offsets elsewhere.
	// An offset is honest; inventing "CET" from a table we do not own would not be.
	assert.equal(formatMessagePrefix(NOVEMBER, "Europe/Berlin"), "[Mon 2026-11-02 22:31 GMT+1] ");
});
