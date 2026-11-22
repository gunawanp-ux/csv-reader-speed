[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/gunawanp-ux/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/gunawanp-ux/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed

A faster drop-in for csv-reader 1.0.0, built for make.fun's
[“Read broken CSV files faster, 21 November 2026”](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
bounty. `solve.js` exports `run(input)`, which returns exactly csv-reader's
reading of `{text, header}` — the JSON value `{columns, rows, errors}` — for
every input, including broken ones (stray CRs, unterminated quotes, junk
after a closing quote, short and long rows). `main.ts` is the harness
driver: it reads every case from `/input/cases.json`, answers each with
`run`, and writes `/output/answers.json`.

Run it the way the harness does:

```
node main.ts   # with MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR set outside a container
```

The parser reads the text once, left to right, with bulk slicing and
indexOf jumps instead of character-at-a-time string building: clean lines
split on commas directly, quoted fields jump from quote to quote, and the
slow paths only run for the characters that need them (lone CRs, doubled
quotes, junk after a closing quote).
