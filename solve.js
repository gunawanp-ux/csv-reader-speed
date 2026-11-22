// A faster drop-in for csv-reader 1.0.0: run(input) returns exactly
// csv-reader's reading of {text, header} — the JSON value {columns, rows,
// errors} — for every input, computed with bulk slicing and indexOf jumps
// instead of character-at-a-time string building.
//
// The reading policy is csv-reader 1.0.0's own, followed exactly:
// - the text is read once, left to right, with commas and double quotes;
// - a U+FEFF at the very start is dropped;
// - a record ends at LF or CRLF, and a line left with no characters is no
//   record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a field that opens with a quote runs to the next quote that is not
//   doubled: "" inside it is one quote, and each CRLF or lone CR inside it is
//   read as LF; what follows its closing quote, up to the next comma or line
//   break, is appended as it stands (quote_junk, when the field ends); a
//   quote that never closes is a literal character, and the text after it is
//   read again as unquoted (unterminated_quote);
// - a quote inside an unquoted field is a literal character; fields stay
//   strings, never trimmed or converted;
// - columns is the first record when header is true, else null; rows holds
//   the records after it (every record when header is false), each padded
//   with empty strings (short_row, with fields: its field count) or cut
//   (long_row, with extra: the cut fields) to the first record's width;
// - each error is {code, line, row}, in the order met: line the 1-based line
//   its record starts on, counting every LF, CRLF and lone CR inside quotes,
//   and row its record's index in rows, null for the header.

// How a field ended.
const COMMA = 0; // at a comma: the record goes on
const BREAK = 1; // at a line break: the record ends
const END = 2; // at the end of the text: the record ends

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: errors met while reading it carry these.
  let recordLine = 1;
  let recordRow = null;

  // The field just read, shared through these instead of a fresh object.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // Reads an unquoted field body starting at pos onto `prefix`: characters up
  // to the next comma or line break, with each lone CR dropped (stray_cr).
  // fAdded counts the characters this call kept.
  function readUnquoted(prefix) {
    const start = pos;
    let i = pos;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44 || c === 10 || c === 13) break;
      i++;
    }
    if (i >= n) {
      fValue = prefix + text.slice(start, n);
      fEnded = END;
      fAdded = n - start;
      pos = n;
      return;
    }
    const c = text.charCodeAt(i);
    if (c === 44) {
      fValue = prefix + text.slice(start, i);
      fEnded = COMMA;
      fAdded = i - start;
      pos = i + 1;
      return;
    }
    if (c === 10) {
      fValue = prefix + text.slice(start, i);
      fEnded = BREAK;
      fAdded = i - start;
      pos = i + 1;
      line++;
      return;
    }
    if (text.charCodeAt(i + 1) === 10) {
      // CR at i is half of a CRLF: the field ends.
      fValue = prefix + text.slice(start, i);
      fEnded = BREAK;
      fAdded = i - start;
      pos = i + 2;
      line++;
      return;
    }
    // A lone CR: drop it (stray_cr) and keep reading, joining the segments
    // on either side of every lone CR in this field.
    let value = prefix + text.slice(start, i);
    let added = i - start;
    pos = i;
    while (pos < n) {
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos += 1;
      const segStart = pos;
      let j = pos;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === 44 || d === 10 || d === 13) break;
        j++;
      }
      value += text.slice(segStart, j);
      added += j - segStart;
      pos = j;
      if (j >= n) {
        fValue = value;
        fEnded = END;
        fAdded = added;
        return;
      }
      const d = text.charCodeAt(j);
      if (d === 44) {
        pos = j + 1;
        fValue = value;
        fEnded = COMMA;
        fAdded = added;
        return;
      }
      if (d === 10) {
        pos = j + 1;
        line++;
        fValue = value;
        fEnded = BREAK;
        fAdded = added;
        return;
      }
      if (text.charCodeAt(j + 1) === 10) {
        pos = j + 2;
        line++;
        fValue = value;
        fEnded = BREAK;
        fAdded = added;
        return;
      }
      // Another lone CR at j: the loop drops it too.
    }
    fValue = value;
    fEnded = END;
    fAdded = added;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote is the first quote that is not doubled.
    let i = open + 1;
    let close = -1;
    while (i < n) {
      const q = text.indexOf('"', i);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        i = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    let value = text.slice(open + 1, close);
    // Every LF, CRLF and lone CR inside counts one line; CRLF and a lone CR
    // are each read as LF, and "" is one quote.
    const breaks = value.match(/\r\n|\r|\n/g);
    if (breaks !== null) line += breaks.length;
    if (value.indexOf('\r') !== -1) value = value.replace(/\r\n|\r/g, '\n');
    if (value.indexOf('"') !== -1) value = value.replace(/""/g, '"');
    pos = close + 1;
    if (pos >= n) {
      fValue = value;
      fEnded = END;
      fAdded = 0;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      fAdded = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line++;
      fValue = value;
      fEnded = BREAK;
      fAdded = 0;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line++;
      fValue = value;
      fEnded = BREAK;
      fAdded = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break (quote_junk, when anything was appended).
    readUnquoted(value);
    if (fAdded > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields = null;
    let quoted = false;

    // Fast path: when the rest of this line holds no quote and no CR but a
    // trailing CRLF, the record is the line split on commas.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : nl;
    const seg = text.slice(pos, lineEnd);
    if (seg.indexOf('"') === -1) {
      const cr = seg.indexOf('\r');
      if (cr === -1) {
        fields = seg.split(',');
        pos = lineEnd;
        if (nl !== -1) {
          pos += 1;
          line += 1;
        }
      } else if (nl !== -1 && cr === seg.length - 1) {
        fields = seg.slice(0, -1).split(',');
        pos = lineEnd + 1;
        line += 1;
      }
    }

    if (fields === null) {
      fields = [];
      do {
        quoted = text.charCodeAt(pos) === 34;
        if (quoted) readQuoted();
        else readUnquoted('');
        fields.push(fValue);
      } while (fEnded === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}
