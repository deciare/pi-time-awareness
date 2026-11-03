# pi-time-awareness

`pi-time-awareness` is a [Pi](https://pi.dev) extension that tells the model what
time it is. Two independent pieces, both off nothing and on by default:

1. **Every user message reaching the model carries the local time it was sent.**
   `[Mon 2026-11-02 16:31 EST] ` goes in front of the text, taken from the
   message's own timestamp in the transcript.
2. **The system prompt can name the current time** (`nowLine`, off by default),
   so "what time is it" does not need a shell call.

## Why this exists

Pi records a timestamp on every message and then never sends it. The transcript
keeps both forms — `message.timestamp` in Unix milliseconds and the entry's
`timestamp` in ISO 8601 — but every provider adapter serialises role and content
only, and the system prompt contains no date or time at all. A model reading the
conversation therefore has no idea whether the last message arrived a minute or
a week ago, or what day it is now.

The extension adds that back at the only layer where it does not cost anything:
the provider payload.

## What it does not do

It never edits the transcript. The session file on disk keeps the words as they
were typed, and the UI keeps showing them without a prefix. Only what the model
reads is marked up, and only for the duration of the request.

## Install

For a local checkout, mount or copy this directory where Pi can load it and add
it to `packages` in Pi's `settings.json`:

```json
{
  "packages": [
    "../../extensions/pi-time-awareness"
  ]
}
```

A git package works the same way once the repository is published:

```bash
pi install git:github.com/deciare/pi-time-awareness
```

No configuration is required. The defaults prefix user messages in the
container's own zone, which is what you want when `TZ` is set on the container.

## Configuration

`pi-time-awareness.json` is read from Pi's agent directory, and from a trusted
project's `.pi/` directory, where project values override global values key by
key. The global file is used when the project is not trusted. Unknown keys and
invalid values reject that file with a warning and leave the defaults in force,
so a typo cannot leave the extension looking configured when it is not.

```json
{
  "enabled": true,
  "timeZone": "auto",
  "nowLine": false
}
```

| Key | Type | Default | Meaning |
|---|---|---:|---|
| `enabled` | boolean | `true` | Prefix user messages at all. |
| `timeZone` | string | `"auto"` | `auto` follows the container; any other value is an IANA zone name, validated at load time. |
| `nowLine` | boolean | `false` | Add a `current_time` section to the system prompt for each request. |

## Which zone the prefixes are written in

`auto` resolves in this order:

1. the `TZ` environment variable, as the runtime normalises it (`EST5EDT`
   becomes `America/New_York`);
2. the container's local zone, from `/etc/localtime`;
3. UTC.

The resolved zone and its source are written to the log once per session:

```
time-awareness: zone America/New_York (env America/New_York), prefixing
```

That line exists because this is the one setting whose failure is silent. A
wrong `TZ` does not produce an error; it produces confident, wrong timestamps.

Set `TZ` on the container rather than relying on `/etc/localtime`. Docker images
default to UTC, and Pi reads `TZ` at startup, so the setting takes effect at the
next process start, not the next turn.

## Format

```
[Mon 2026-11-02 16:31 EST] 
```

Weekday, ISO date, 24-hour local time, zone abbreviation. It is fixed rather
than configurable: a prefix that changes shape between messages is noise, and
this shape reads as a timestamp without a legend.

Abbreviations are `en-US` short names. Zones that locale has no abbreviation for
render as an offset — `GMT+1` rather than `CET` — which is honest but vague. The
`nowLine` section therefore names the IANA zone as well:

```
Now: Mon 2026-11-02 16:31 EST (America/New_York)
```

## What gets a prefix

Only real user messages. `bashExecution`, `custom` messages, and the compaction
and branch summaries also reach the provider as user turns, but they are the
harness speaking rather than the person, and a timestamp in front of them would
claim otherwise. Image-only user messages are left alone rather than having a
text block grafted into them.

## Cost

- Every prefixed message costs a handful of tokens, once per message and then
  on every replay of the history.
- The prefix is derived from the message's own timestamp, so it is byte
  identical on every re-send and does not disturb prompt caching.
- `nowLine` is the exception: it changes the system prompt, which is the start
  of the cached prefix. Turn it on for sessions where orientation matters more
  than cache locality.

## Tests

```bash
npm ci
npm test
npm run typecheck
```

The tests cover the zone chain, the format at daylight-saving boundaries, the
transform's placement and idempotence, and the extension's own wiring through a
stand-in for the extension API.
