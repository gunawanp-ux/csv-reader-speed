# csv-reader-speed

A faster drop-in for csv-reader 1.0.0: `solve.js` exports `run(input)`,
which returns exactly csv-reader's reading of `{text, header}` — the JSON
value `{columns, rows, errors}` — for every input, including broken ones
(stray CRs, unterminated quotes, junk after a closing quote, short and long
rows). `main.ts` is the harness driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

The parser reads the text once, left to right, with bulk slicing and
indexOf jumps instead of character-at-a-time string building: clean lines
split on commas directly, quoted fields jump from quote to quote, and the
slow paths only run for the characters that need them (lone CRs, doubled
quotes, junk after a closing quote).
