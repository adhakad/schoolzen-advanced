# `system-holidays` — the state-wise public holiday preset

This collection is **hand-maintained in MongoDB Compass**. No application code writes to it,
no seed script populates it, and nothing fetches it from an external API. Adding next year's
dates or a new state is an insert — **no deployment required**.

## What reads it

`GET /v1/holiday-template/public-states/:year` lists the states that have data for a year
(this is what fills the state dropdown on the admin's **Holiday → Templates** tab), and
`POST /v1/holiday-template/generate-from-public` clones one state's list into a school.

Cloning is a **one-time copy**. Every entry becomes a normal, editable `Holiday` document
owned by that school, bundled into a template the admin names themselves. Correcting a date
here afterwards never retroactively changes a school that has already generated from it.

## Document shape

One document per `state` + `year` (unique index on the pair):

```json
{ "state": "MP", "year": 2026, "holidays": [ { "name": "Republic Day", "date": "2026-01-26" } ] }
```

- `state` — `"NATIONAL"` for the holidays common to all of India, otherwise a state key
  (`"MP"`, `"MH"`, …). Stored uppercase; the model uppercases on write so a lowercase Compass
  entry still matches.
- `year` — a Number, not a string.
- `holidays[].date` — a **`"YYYY-MM-DD"` string**, deliberately not a BSON Date. A Date pasted
  into Compass is interpreted in the local zone and can land a day out; the string is
  converted through `helpers/date-only.js` at clone time, the same path every other date in
  the attendance module takes.

## Importing

`system-holidays-sample.json` in this folder is a ready-to-paste array. In Compass: open the
`system-holidays` collection → **Add Data → Import JSON** (or **Insert Document** and paste
one object at a time).

## Rules for the data itself

- **Use officially notified dates only.** National holidays come from the central
  government's gazetted holiday list; state holidays come from that state's General
  Administration Department gazette notification. Do not fill a state in from a generic
  "common Indian festivals" list.
- **Do not mix in restricted/optional holidays.** This collection is compulsory public
  holidays. A restricted holiday a school actually observes should be added by the admin as
  an ordinary Holiday after cloning.
- **Fewer states with verified dates beats more states with guesses.** A state with no
  document simply does not appear in the dropdown, which is a correct and readable outcome.
  An approximate date is not.

The shipped sample carries only the three fixed-date national gazetted holidays — Republic
Day, Independence Day and Gandhi Jayanti — because those do not move year to year. Every
variable-date festival (Holi, Eid, Diwali, Good Friday, and the rest) and every state-specific
holiday must be taken from the official notification for that year and added here by hand.
